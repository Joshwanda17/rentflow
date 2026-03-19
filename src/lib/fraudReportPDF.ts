// jsPDF loaded dynamically to reduce initial bundle size
import { supabase } from '@/integrations/supabase/client';

function formatUGX(n: number): string {
  return n.toLocaleString() + ' UGX';
}

export async function generateFraudReportPDF(): Promise<void> {
  // --- DATA GATHERING ---
  const [earningsRes, withdrawalsRes, referralsRes, txnsRes] = await Promise.all([
    supabase.from('agent_earnings').select('agent_id, amount'),
    supabase.from('withdrawal_requests' as any).select('user_id, amount, status, created_at'),
    supabase.from('referrals').select('referrer_id, referred_id'),
    supabase.from('wallet_transactions' as any).select('sender_id, recipient_id, amount, transaction_type').eq('transaction_type', 'transfer'),
  ]);

  const earningsMap = new Map<string, number>();
  earningsRes.data?.forEach((e: any) => earningsMap.set(e.agent_id, (earningsMap.get(e.agent_id) || 0) + e.amount));

  const withdrawalsByUser = new Map<string, { total: number; count: number }>();
  const spammerMap = new Map<string, { userId: string; count: number; amount: number }>();
  (withdrawalsRes.data as any[])?.forEach(w => {
    const curr = withdrawalsByUser.get(w.user_id) || { total: 0, count: 0 };
    curr.total += w.amount;
    curr.count += 1;
    withdrawalsByUser.set(w.user_id, curr);
    const key = `${w.user_id}_${w.amount}`;
    const sc = spammerMap.get(key) || { userId: w.user_id, count: 0, amount: w.amount };
    sc.count += 1;
    spammerMap.set(key, sc);
  });

  const referralCounts = new Map<string, number>();
  referralsRes.data?.forEach(r => referralCounts.set(r.referrer_id, (referralCounts.get(r.referrer_id) || 0) + 1));

  // Collect suspect IDs
  const suspectIds = new Set<string>();
  withdrawalsByUser.forEach((wd, uid) => {
    if (wd.total > (earningsMap.get(uid) || 0) + 50000) suspectIds.add(uid);
  });
  referralCounts.forEach((count, uid) => { if (count >= 20) suspectIds.add(uid); });
  spammerMap.forEach(val => { if (val.count >= 5) suspectIds.add(val.userId); });

  // Get profiles
  const suspectArr = Array.from(suspectIds);
  const profileMap = new Map<string, { full_name: string; phone: string }>();
  for (let i = 0; i < suspectArr.length; i += 50) {
    const { data } = await supabase.from('profiles').select('id, full_name, phone').in('id', suspectArr.slice(i, i + 50));
    data?.forEach(p => profileMap.set(p.id, { full_name: p.full_name, phone: p.phone }));
  }

  // Build lists
  type FraudUser = { name: string; phone: string; earnings: number; withdrawals: number; excess: number; refs: number };
  const abusers: FraudUser[] = [];
  const farms: FraudUser[] = [];

  suspectArr.forEach(uid => {
    const p = profileMap.get(uid);
    const earn = earningsMap.get(uid) || 0;
    const wd = withdrawalsByUser.get(uid)?.total || 0;
    const refs = referralCounts.get(uid) || 0;
    const entry: FraudUser = { name: p?.full_name || 'Unknown', phone: p?.phone || 'N/A', earnings: earn, withdrawals: wd, excess: wd - earn, refs };
    if (wd > earn + 50000) abusers.push(entry);
    if (refs >= 20) farms.push(entry);
  });
  abusers.sort((a, b) => b.excess - a.excess);
  farms.sort((a, b) => b.refs - a.refs);

  // Spammers
  const spammers: { name: string; phone: string; count: number; amount: number }[] = [];
  spammerMap.forEach(val => {
    if (val.count >= 5) {
      const p = profileMap.get(val.userId);
      spammers.push({ name: p?.full_name || val.userId.slice(0, 8), phone: p?.phone || 'N/A', count: val.count, amount: val.amount });
    }
  });

  // Circular rings
  const transferPairs = new Map<string, number>();
  (txnsRes.data as any[])?.forEach(t => {
    if (t.sender_id && t.recipient_id) {
      const key = `${t.sender_id}->${t.recipient_id}`;
      transferPairs.set(key, (transferPairs.get(key) || 0) + t.amount);
    }
  });
  const rings: { desc: string }[] = [];
  const visited = new Set<string>();
  transferPairs.forEach((amt, key) => {
    const [a, b] = key.split('->');
    const rev = `${b}->${a}`;
    if (transferPairs.has(rev) && !visited.has(key)) {
      visited.add(key); visited.add(rev);
      const nA = profileMap.get(a)?.full_name || a.slice(0, 8);
      const nB = profileMap.get(b)?.full_name || b.slice(0, 8);
      rings.push({ desc: `${nA} ↔ ${nB}: ${amt.toLocaleString()} UGX sent, ${transferPairs.get(rev)!.toLocaleString()} UGX returned` });
    }
  });

  // Critical exploits
  const exploits = abusers.filter(u => u.withdrawals > 1000000 && u.earnings < 100000);

  // --- PDF GENERATION ---
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const m = 15;
  const cw = pw - m * 2;
  let y = m;

  const check = (n: number) => { if (y + n > ph - 12) { pdf.addPage(); y = m; } };

  const sectionTitle = (t: string) => {
    check(14);
    pdf.setFontSize(12); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(160, 20, 20);
    pdf.text(t, m, y); y += 5;
    pdf.setDrawColor(160, 20, 20); pdf.line(m, y, pw - m, y); y += 5;
  };

  const line = (t: string, size = 9) => {
    pdf.setFontSize(size); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
    const ls = pdf.splitTextToSize(t, cw);
    check(ls.length * 4 + 1);
    pdf.text(ls, m, y); y += ls.length * 4 + 1;
  };

  const row = (cols: string[], widths: number[], bold = false) => {
    check(5);
    pdf.setFontSize(7.5); pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setTextColor(bold ? 0 : 60, bold ? 0 : 60, bold ? 0 : 60);
    let x = m;
    cols.forEach((c, i) => { pdf.text(c.slice(0, 28), x, y); x += widths[i]; });
    y += 4;
  };

  // Title
  pdf.setFontSize(18); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(160, 20, 20);
  pdf.text('FRAUD INVESTIGATION REPORT', m, y); y += 7;
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
  pdf.text(`Welile Platform  |  Generated: ${new Date().toLocaleString()}  |  CONFIDENTIAL`, m, y); y += 10;

  // 1. Critical Exploits
  if (exploits.length > 0) {
    sectionTitle(`1. CRITICAL EXPLOITS (${exploits.length})`);
    line('Users with withdrawal amounts massively exceeding legitimate earnings:');
    exploits.forEach((c, i) => {
      line(`${i + 1}. ${c.name} (${c.phone}) — Earnings: ${formatUGX(c.earnings)}, Withdrawals: ${formatUGX(c.withdrawals)}, Ratio: ${Math.round(c.withdrawals / Math.max(c.earnings, 1))}x`);
    });
    y += 3;
  }

  // 2. Referral Farms
  sectionTitle(`2. REFERRAL ACCOUNT FARMS (${farms.length})`);
  line('Users with 20+ referrals — potential fake account creation:');
  const tw = [45, 28, 22, 35, 35];
  row(['Name', 'Phone', 'Referrals', 'Earnings', 'Withdrawals'], tw, true);
  farms.slice(0, 30).forEach(u => row([u.name, u.phone, String(u.refs), formatUGX(u.earnings), formatUGX(u.withdrawals)], tw));
  y += 3;

  // 3. Withdrawal Abuse
  sectionTitle(`3. WITHDRAWAL ABUSE (${abusers.length})`);
  line('Users requesting withdrawals exceeding earnings by > 50,000 UGX:');
  const tw2 = [40, 28, 30, 33, 33];
  row(['Name', 'Phone', 'Earnings', 'Requested', 'Excess'], tw2, true);
  abusers.slice(0, 40).forEach(u => row([u.name, u.phone, formatUGX(u.earnings), formatUGX(u.withdrawals), formatUGX(u.excess)], tw2));
  y += 3;

  // 4. Circular Rings
  sectionTitle(`4. CIRCULAR TRANSFER RINGS (${rings.length})`);
  line('Bidirectional transfer pairs detected — money sent back and forth:');
  rings.forEach((r, i) => line(`${i + 1}. ${r.desc}`));
  y += 3;

  // 5. Spammers
  sectionTitle(`5. WITHDRAWAL SPAMMERS (${spammers.length})`);
  line('Users submitting 5+ identical withdrawal requests:');
  spammers.forEach((s, i) => line(`${i + 1}. ${s.name} (${s.phone}): ${s.count}x requests of ${formatUGX(s.amount)}`));

  // Footers
  const tp = pdf.getNumberOfPages();
  for (let i = 1; i <= tp; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(150, 150, 150);
    pdf.text(`Page ${i}/${tp} — Welile Fraud Report — CONFIDENTIAL`, m, ph - 7);
  }

  // Download
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `welile-fraud-report-${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
