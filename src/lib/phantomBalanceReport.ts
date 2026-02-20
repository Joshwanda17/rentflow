import { jsPDF } from 'jspdf';

interface AffectedUser {
  full_name: string;
  phone: string;
  balance: number;
  deposits: number;
  earnings: number;
  ref_bonus: number;
  withdrawn: number;
  phantom_amount: number;
}

export function generatePhantomBalancesPDF() {
  const users: AffectedUser[] = [
    { full_name: 'mpooya umaru', phone: '0756060590', balance: 50000, deposits: 0, earnings: 21500, ref_bonus: 21500, withdrawn: 0, phantom_amount: 7000 },
    { full_name: 'jude', phone: '0709250818', balance: 500, deposits: 0, earnings: 4000, ref_bonus: 3000, withdrawn: 9000, phantom_amount: 2500 },
    { full_name: 'Ainembabazi shanitah', phone: '0767000272', balance: 500, deposits: 0, earnings: 500, ref_bonus: 500, withdrawn: 1000, phantom_amount: 500 },
  ];

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const m = 15;
  const pw = pdf.internal.pageSize.getWidth();
  let y = m;

  // Title
  pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(180, 30, 30);
  pdf.text('PHANTOM BALANCE CORRECTION REPORT', m, y); y += 7;
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
  pdf.text(`Welile Platform  |  Generated: ${new Date().toLocaleString()}  |  CONFIDENTIAL`, m, y); y += 4;
  pdf.text('Users with wallet balances exceeding legitimate income sources', m, y); y += 8;

  // Summary
  const totalPhantom = users.reduce((s, u) => s + u.phantom_amount, 0);
  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(40, 40, 40);
  pdf.text(`Total Affected Users: ${users.length}`, m, y); y += 5;
  pdf.text(`Total Phantom Amount: ${totalPhantom.toLocaleString()} UGX`, m, y); y += 8;

  // Divider
  pdf.setDrawColor(180, 30, 30); pdf.line(m, y, pw - m, y); y += 6;

  // Table header
  const cols = ['#', 'Name', 'Phone', 'Balance', 'Legitimate', 'Phantom', 'Action'];
  const widths = [8, 38, 28, 22, 22, 22, 30];
  pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
  let x = m;
  cols.forEach((c, i) => { pdf.text(c, x, y); x += widths[i]; });
  y += 2;
  pdf.setDrawColor(200, 200, 200); pdf.line(m, y, pw - m, y); y += 4;

  // Rows
  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40, 40, 40);
  users.forEach((u, i) => {
    const legitimate = u.deposits + u.earnings + u.ref_bonus - u.withdrawn;
    x = m;
    const row = [
      String(i + 1),
      u.full_name.slice(0, 22),
      u.phone,
      u.balance.toLocaleString(),
      legitimate.toLocaleString(),
      u.phantom_amount.toLocaleString(),
      `Deduct ${u.phantom_amount.toLocaleString()}`
    ];
    row.forEach((c, j) => { pdf.text(c, x, y); x += widths[j]; });
    y += 5;
  });

  y += 6;
  pdf.setDrawColor(180, 30, 30); pdf.line(m, y, pw - m, y); y += 6;

  // Detail cards
  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(180, 30, 30);
  pdf.text('DETAILED BREAKDOWN', m, y); y += 7;

  users.forEach((u, i) => {
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(40, 40, 40);
    pdf.text(`${i + 1}. ${u.full_name} (${u.phone})`, m, y); y += 5;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    pdf.text(`Current Balance: ${u.balance.toLocaleString()} UGX`, m + 4, y); y += 4;
    pdf.text(`Approved Deposits: ${u.deposits.toLocaleString()} UGX`, m + 4, y); y += 4;
    pdf.text(`Agent Earnings: ${u.earnings.toLocaleString()} UGX`, m + 4, y); y += 4;
    pdf.text(`Referral Bonuses: ${u.ref_bonus.toLocaleString()} UGX`, m + 4, y); y += 4;
    pdf.text(`Total Withdrawn: ${u.withdrawn.toLocaleString()} UGX`, m + 4, y); y += 4;
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(180, 30, 30);
    pdf.text(`Phantom Amount: ${u.phantom_amount.toLocaleString()} UGX — DEDUCT from wallet`, m + 4, y); y += 4;
    const correctBalance = u.balance - u.phantom_amount;
    pdf.setTextColor(0, 120, 0);
    pdf.text(`Correct Balance After Adjustment: ${correctBalance.toLocaleString()} UGX`, m + 4, y); y += 7;
    pdf.setTextColor(40, 40, 40);
  });

  // Instructions
  y += 3;
  pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(40, 40, 40);
  pdf.text('INSTRUCTIONS FOR MANAGER:', m, y); y += 5;
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
  const steps = [
    '1. Open Wallet Manager in the Manager Dashboard',
    '2. Search for each user by phone number',
    '3. Use "Remove Money" to deduct the phantom amount listed above',
    '4. Use justification: "Phantom balance correction — deposit double-credit bug fix"',
    '5. The bug has been fixed — no new phantom balances will occur',
  ];
  steps.forEach(s => { pdf.text(s, m, y); y += 4; });

  // Footer
  pdf.setFontSize(7); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(150, 150, 150);
  pdf.text('Page 1/1 — Welile Phantom Balance Report — CONFIDENTIAL', m, pdf.internal.pageSize.getHeight() - 7);

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
