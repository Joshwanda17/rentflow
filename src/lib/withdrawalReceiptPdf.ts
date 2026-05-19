// Generates a single-page PDF receipt for a confirmed withdrawal request.
// Uses jsPDF dynamically to keep it out of the initial bundle.
import { format } from 'date-fns';

export interface WithdrawalReceiptData {
  reference: string;
  amount: number;
  currency: string;
  recipient: string;
  method: string;
  date: Date;
  status?: string;
}

export async function downloadWithdrawalReceiptPdf(data: WithdrawalReceiptData): Promise<void> {
  const { default: JsPDF } = await import('jspdf');
  const doc = new JsPDF({ unit: 'pt', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 48;
  let y = 64;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Withdrawal Receipt', marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120);
  y += 18;
  doc.text('Welile — server-confirmed', marginX, y);
  doc.setTextColor(0);

  // Amount block
  y += 36;
  doc.setDrawColor(220);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 70, 8, 8, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text('Amount', marginX + 16, y + 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(20);
  doc.text(`${data.currency} ${Math.round(data.amount).toLocaleString()}`, marginX + 16, y + 52);
  y += 70;

  // Details
  const rows: Array<[string, string]> = [
    ['Reference', data.reference],
    ['Status', data.status ?? 'Pending disbursement'],
    ['Processed', format(data.date, 'MMM d, yyyy HH:mm')],
    ['Method', data.method],
    ['Recipient', data.recipient],
  ];

  y += 24;
  doc.setFontSize(11);
  rows.forEach(([label, value]) => {
    doc.setTextColor(110);
    doc.setFont('helvetica', 'normal');
    doc.text(label, marginX, y);
    doc.setTextColor(20);
    doc.setFont('helvetica', 'bold');
    const valueLines = doc.splitTextToSize(String(value ?? '-'), pageWidth - marginX * 2 - 120);
    doc.text(valueLines, marginX + 120, y);
    y += 16 * Math.max(1, valueLines.length) + 6;
    doc.setDrawColor(235);
    doc.line(marginX, y - 4, pageWidth - marginX, y - 4);
  });

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text(
    'This receipt confirms the withdrawal request was accepted by Welile. Funds are released after Financial Ops approval.',
    marginX,
    doc.internal.pageSize.getHeight() - 48,
    { maxWidth: pageWidth - marginX * 2 },
  );

  const safeRef = (data.reference || 'receipt').replace(/[^A-Za-z0-9_-]/g, '_');
  doc.save(`withdrawal_${safeRef}.pdf`);
}
