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
  /**
   * Itemised fee/expense lines that apply to this withdrawal. Each entry
   * shows as its own row in the breakdown panel. Use a negative `amount`
   * for charges (deductions) and a positive amount for adjustments that
   * increase the payout (rare). Leave undefined/empty when no fees apply
   * — the panel will show a single "Zero platform fees" line instead.
   */
  feeBreakdown?: Array<{ label: string; amount: number }>;
}

function safeRefOf(data: WithdrawalReceiptData): string {
  return (data.reference || 'receipt').replace(/[^A-Za-z0-9_-]/g, '_');
}

export function withdrawalReceiptFilename(data: WithdrawalReceiptData): string {
  return `withdrawal_${safeRefOf(data)}.pdf`;
}

/** Build the PDF in-memory and return a Blob (used for sharing). */
export async function buildWithdrawalReceiptPdfBlob(data: WithdrawalReceiptData): Promise<Blob> {
  const doc = await renderWithdrawalReceiptPdf(data);
  return doc.output('blob') as Blob;
}

async function renderWithdrawalReceiptPdf(data: WithdrawalReceiptData) {
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
  doc.text('Gross Amount', marginX + 16, y + 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(20);
  doc.text(`${data.currency} ${Math.round(data.amount).toLocaleString()}`, marginX + 16, y + 52);
  y += 70;

  // ── Fee / expense breakdown ───────────────────────────────────────
  // Always render a small breakdown panel so the user can audit what
  // was (or wasn't) deducted. When `feeBreakdown` is empty we show a
  // single reassurance line — Welile charges no platform withdrawal
  // fees today, but third-party operator charges can be itemised here
  // when the caller knows them.
  const fees = (data.feeBreakdown ?? []).filter((f) => Number.isFinite(f.amount));
  const totalFees = fees.reduce((sum, f) => sum + Math.round(f.amount), 0);
  const netAmount = Math.max(0, Math.round(data.amount) - totalFees);

  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text('Fee Breakdown', marginX, y);
  y += 10;
  doc.setDrawColor(230);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const drawLine = (label: string, valueText: string, opts?: { bold?: boolean; muted?: boolean }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setTextColor(opts?.muted ? 130 : 30);
    doc.text(label, marginX, y);
    const valueWidth = doc.getTextWidth(valueText);
    doc.text(valueText, pageWidth - marginX - valueWidth, y);
    y += 16;
  };

  drawLine('Withdrawal amount', `${data.currency} ${Math.round(data.amount).toLocaleString()}`);

  if (fees.length === 0) {
    drawLine('Platform service fee', `${data.currency} 0`, { muted: true });
    drawLine('Transaction expenses', `${data.currency} 0`, { muted: true });
  } else {
    fees.forEach((f) => {
      const amt = Math.round(f.amount);
      const sign = amt < 0 ? '+' : amt > 0 ? '−' : '';
      drawLine(f.label, `${sign}${data.currency} ${Math.abs(amt).toLocaleString()}`);
    });
  }

  y += 4;
  doc.setDrawColor(210);
  doc.line(marginX, y - 8, pageWidth - marginX, y - 8);
  drawLine('Net amount payable', `${data.currency} ${netAmount.toLocaleString()}`, { bold: true });

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
  return doc;
}

export async function downloadWithdrawalReceiptPdf(data: WithdrawalReceiptData): Promise<void> {
  const doc = await renderWithdrawalReceiptPdf(data);
  doc.save(withdrawalReceiptFilename(data));
}

/**
 * Share the receipt PDF via the device share sheet (Web Share Level 2).
 * Returns `true` when the share sheet was opened (or share completed) and
 * `false` when the platform cannot share files — caller should fall back
 * to `downloadWithdrawalReceiptPdf`.
 */
export async function shareWithdrawalReceiptPdf(data: WithdrawalReceiptData): Promise<boolean> {
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  const blob = await buildWithdrawalReceiptPdfBlob(data);
  const filename = withdrawalReceiptFilename(data);

  if (nav && typeof nav.canShare === 'function' && typeof nav.share === 'function') {
    try {
      const file = new File([blob], filename, { type: 'application/pdf' });
      const payload = {
        files: [file],
        title: 'Withdrawal Receipt',
        text: `Withdrawal receipt ${data.reference} — ${data.currency} ${Math.round(data.amount).toLocaleString()}`,
      };
      if (nav.canShare(payload)) {
        await nav.share(payload);
        return true;
      }
    } catch (e: any) {
      // AbortError = user dismissed; treat as handled (no fallback download).
      if (e?.name === 'AbortError') return true;
      console.warn('[withdrawalReceiptPdf] share failed', e);
    }
  }
  return false;
}
