// jsPDF loaded dynamically to reduce initial bundle size
import { supabase } from '@/integrations/supabase/client';

interface AffectedUser {
  full_name: string;
  phone: string;
  balance: number;
  deposits: number;
  earnings: number;
  ref_bonus: number;
  withdrawn: number;
  phantom_amount: number;
  referral_count?: number;
  flag?: string;
}

async function fetchAffectedUsers(): Promise<AffectedUser[]> {
  // Get all wallets with positive balance
  const { data: wallets } = await supabase.from('wallets').select('user_id, balance').gt('balance', 0);
  if (!wallets?.length) return [];

  const userIds = wallets.map(w => w.user_id);

  // Fetch all income sources in parallel
  const [depositsRes, earningsRes, referralsRes, withdrawalsRes] = await Promise.all([
    supabase.from('deposit_requests').select('user_id, amount').eq('status', 'approved').in('user_id', userIds),
    supabase.from('agent_earnings').select('agent_id, amount').in('agent_id', userIds),
    supabase.from('referrals').select('referrer_id, bonus_amount, credited, first_transaction_bonus_amount, first_transaction_bonus_credited').in('referrer_id', userIds),
    supabase.from('withdrawal_requests').select('user_id, amount, status').in('user_id', userIds).in('status', ['pending', 'approved']),
  ]);

  // Fetch profiles
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').in('id', userIds);
  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

  // Aggregate deposits
  const depositMap = new Map<string, number>();
  depositsRes.data?.forEach(d => depositMap.set(d.user_id, (depositMap.get(d.user_id) || 0) + Number(d.amount)));

  // Aggregate earnings
  const earningMap = new Map<string, number>();
  earningsRes.data?.forEach(e => earningMap.set(e.agent_id, (earningMap.get(e.agent_id) || 0) + Number(e.amount)));

  // Aggregate referral bonuses + count
  const refMap = new Map<string, number>();
  const refCountMap = new Map<string, number>();
  referralsRes.data?.forEach(r => {
    const uid = r.referrer_id;
    let bonus = 0;
    if (r.credited) bonus += Number(r.bonus_amount || 0);
    if (r.first_transaction_bonus_credited) bonus += Number(r.first_transaction_bonus_amount || 0);
    refMap.set(uid, (refMap.get(uid) || 0) + bonus);
    refCountMap.set(uid, (refCountMap.get(uid) || 0) + 1);
  });

  // Aggregate withdrawals
  const withdrawMap = new Map<string, number>();
  withdrawalsRes.data?.forEach(w => withdrawMap.set(w.user_id, (withdrawMap.get(w.user_id) || 0) + Number(w.amount)));

  const affected: AffectedUser[] = [];

  for (const w of wallets) {
    const deposits = depositMap.get(w.user_id) || 0;
    const earnings = earningMap.get(w.user_id) || 0;
    const refBonus = refMap.get(w.user_id) || 0;
    const withdrawn = withdrawMap.get(w.user_id) || 0;
    const refCount = refCountMap.get(w.user_id) || 0;
    const legitimate = deposits + earnings + refBonus - withdrawn;
    const phantom = w.balance - legitimate;
    const profile = profileMap.get(w.user_id);

    // Include if: phantom balance > 0 OR suspected referral farming (50+ referrals)
    const isPhantom = phantom > 0;
    const isFarmer = refCount >= 50;

    if (isPhantom || isFarmer) {
      const flags: string[] = [];
      if (isPhantom) flags.push('PHANTOM');
      if (isFarmer) flags.push(`FARMING(${refCount} refs)`);

      affected.push({
        full_name: profile?.full_name || 'Unknown',
        phone: profile?.phone || 'N/A',
        balance: w.balance,
        deposits,
        earnings,
        ref_bonus: refBonus,
        withdrawn,
        phantom_amount: Math.max(phantom, 0),
        referral_count: refCount,
        flag: flags.join(' + '),
      });
    }
  }

  // Sort by phantom amount descending, then by referral count
  affected.sort((a, b) => b.phantom_amount - a.phantom_amount || (b.referral_count || 0) - (a.referral_count || 0));
  return affected;
}

export async function generatePhantomBalancesPDF() {
  const users = await fetchAffectedUsers();

  if (users.length === 0) {
    throw new Error('No affected users found.');
  }

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const m = 12;
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  let y = m;

  const checkPage = (needed: number) => {
    if (y + needed > ph - 15) {
      pdf.addPage();
      y = m;
    }
  };

  // Title
  pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(180, 30, 30);
  pdf.text('PHANTOM BALANCE & REFERRAL FARMING REPORT', m, y); y += 6;
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
  pdf.text(`Welile Platform  |  Generated: ${new Date().toLocaleString()}  |  CONFIDENTIAL`, m, y); y += 3;
  pdf.text('Users with wallet balances exceeding legitimate income OR suspected referral farming', m, y); y += 6;

  // Summary
  const phantomUsers = users.filter(u => u.phantom_amount > 0);
  const totalPhantom = phantomUsers.reduce((s, u) => s + u.phantom_amount, 0);
  const farmingUsers = users.filter(u => (u.referral_count || 0) >= 50);
  pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(40, 40, 40);
  pdf.text(`Total Affected Users: ${users.length}`, m, y); y += 4;
  pdf.text(`Phantom Balance Users: ${phantomUsers.length}  |  Total Phantom: ${totalPhantom.toLocaleString()} UGX`, m, y); y += 4;
  pdf.text(`Referral Farming Suspects (50+ refs): ${farmingUsers.length}`, m, y); y += 6;

  // Divider
  pdf.setDrawColor(180, 30, 30); pdf.line(m, y, pw - m, y); y += 4;

  // Table header
  const cols = ['#', 'Name', 'Phone', 'Balance', 'Legit', 'Phantom', 'Refs', 'Flag'];
  const widths = [7, 30, 24, 20, 20, 18, 12, 55];
  pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
  let x = m;
  cols.forEach((c, i) => { pdf.text(c, x, y); x += widths[i]; });
  y += 2;
  pdf.setDrawColor(200, 200, 200); pdf.line(m, y, pw - m, y); y += 3;

  // Rows
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
  users.forEach((u, i) => {
    checkPage(5);
    const legitimate = u.deposits + u.earnings + u.ref_bonus - u.withdrawn;
    x = m;
    pdf.setTextColor(40, 40, 40);
    const row = [
      String(i + 1),
      u.full_name.slice(0, 20),
      u.phone,
      u.balance.toLocaleString(),
      legitimate.toLocaleString(),
      u.phantom_amount.toLocaleString(),
      String(u.referral_count || 0),
      (u.flag || '').slice(0, 40),
    ];
    row.forEach((c, j) => { pdf.text(c, x, y); x += widths[j]; });
    y += 4;
  });

  y += 4;
  checkPage(20);
  pdf.setDrawColor(180, 30, 30); pdf.line(m, y, pw - m, y); y += 5;

  // Detail cards
  pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(180, 30, 30);
  pdf.text('DETAILED BREAKDOWN', m, y); y += 6;

  users.forEach((u, i) => {
    checkPage(35);
    pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(40, 40, 40);
    pdf.text(`${i + 1}. ${u.full_name} (${u.phone})`, m, y); y += 4;
    if (u.flag) {
      pdf.setTextColor(180, 30, 30);
      pdf.text(`⚠ ${u.flag}`, m + 4, y); y += 4;
    }
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(40, 40, 40);
    pdf.text(`Current Balance: ${u.balance.toLocaleString()} UGX`, m + 4, y); y += 3.5;
    pdf.text(`Approved Deposits: ${u.deposits.toLocaleString()} UGX`, m + 4, y); y += 3.5;
    pdf.text(`Agent Earnings: ${u.earnings.toLocaleString()} UGX`, m + 4, y); y += 3.5;
    pdf.text(`Referral Bonuses: ${u.ref_bonus.toLocaleString()} UGX  (${u.referral_count || 0} referrals)`, m + 4, y); y += 3.5;
    pdf.text(`Total Withdrawn: ${u.withdrawn.toLocaleString()} UGX`, m + 4, y); y += 3.5;

    if (u.phantom_amount > 0) {
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(180, 30, 30);
      pdf.text(`Phantom Amount: ${u.phantom_amount.toLocaleString()} UGX — DEDUCT from wallet`, m + 4, y); y += 3.5;
      const correctBalance = u.balance - u.phantom_amount;
      pdf.setTextColor(0, 120, 0);
      pdf.text(`Correct Balance After Adjustment: ${Math.max(correctBalance, 0).toLocaleString()} UGX`, m + 4, y); y += 3.5;
    } else {
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(200, 130, 0);
      pdf.text(`No phantom — flagged for referral farming review only`, m + 4, y); y += 3.5;
    }
    y += 3;
    pdf.setTextColor(40, 40, 40);
  });

  // Instructions
  checkPage(30);
  y += 3;
  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(40, 40, 40);
  pdf.text('INSTRUCTIONS FOR MANAGER:', m, y); y += 5;
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal');
  const steps = [
    '1. Open Wallet Manager in the Manager Dashboard',
    '2. Search for each user by phone number',
    '3. For PHANTOM users: Use "Remove Money" to deduct the phantom amount listed above',
    '4. For FARMING suspects: Investigate referral accounts, deactivate fake ones',
    '5. Use justification: "Phantom balance correction — deposit double-credit bug fix"',
    '6. The bug has been fixed — no new phantom balances will occur',
  ];
  steps.forEach(s => { pdf.text(s, m, y); y += 4; });

  // Footer on all pages
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(6); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(150, 150, 150);
    pdf.text(`Page ${i}/${pageCount} — Welile Phantom Balance & Farming Report — CONFIDENTIAL`, m, ph - 5);
  }

  // Download
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `welile-phantom-balance-report-${new Date().toISOString().split('T')[0]}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
