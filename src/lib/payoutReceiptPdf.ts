import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { formatUGX } from '@/lib/rentCalculations';
import welileMark from '@/assets/welile-mark-white.png';
import { assertReceiptContent } from '@/lib/receiptContentPolicy';

/** Shape returned by get_payout_receipt / get_payout_receipt_by_token. */
export interface PayoutReceiptData {
  paid: boolean;
  status?: string;
  amount?: number;
  commission?: number | null;
  payout_method?: string;
  reference?: string;
  receipt_token?: string;
  receipt_number?: string;
  transaction_type?: string;
  processed_at?: string;
  recipient_name?: string;
  processor_name?: string;
  processor_phone?: string;
  merchant_branch?: string | null;
  reason?: string;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
  mobile_money_number?: string | null;
  mobile_money_name?: string | null;
  mobile_money_provider?: string | null;
}

export function receiptMethodLabel(payoutMethod?: string) {
  const pm = (payoutMethod || '').toLowerCase();
  const isBank = pm.includes('bank');
  const isMoMo = pm.includes('momo') || pm.includes('mobile') || pm.includes('mtn') || pm.includes('airtel');
  return { isBank, isMoMo, methodLabel: isBank ? 'Bank Transfer' : isMoMo ? 'Mobile Money' : 'Cash' };
}

export function receiptPublicUrl(data: PayoutReceiptData) {
  return data.receipt_token
    ? `https://welilereceipts.com/r/${data.receipt_token}`
    : (typeof window !== 'undefined' ? window.location.href : '');
}

/**
 * Generates and downloads the customer-facing payout PDF receipt. Shared by the
 * public receipt page (/r/:token, /receipt/:id) and the merchant agent's receipt
 * history page so both render identical output. The merchant commission is never
 * printed — this is the customer receipt.
 */
export async function downloadPayoutReceiptPdf(data: PayoutReceiptData) {
  // Policy guard: this is the CUSTOMER receipt — it must never render the
  // merchant agent's commission. We never draw a commission line below, so the
  // rendered content carries no commission (false).
  assertReceiptContent('customer', false);
  const { isBank, isMoMo, methodLabel } = receiptMethodLabel(data.payout_method);
  const publicUrl = receiptPublicUrl(data);
  const paidAt = data.processed_at ? new Date(data.processed_at) : null;
  const dateStr = paidAt
    ? paidAt.toLocaleString('en-UG', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const cardX = 48;
  const cardW = pageW - cardX * 2;
  let y = 56;

  doc.setFillColor(124, 58, 237);
  doc.roundedRect(cardX, y, cardW, 108, 10, 10, 'F');
  doc.setTextColor(255, 255, 255);
  try {
    const markImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = welileMark;
    });
    const ms = 34;
    doc.addImage(markImg, 'PNG', cardX + cardW / 2 - ms / 2, y + 12, ms, ms);
  } catch { /* mark optional */ }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('WELILE TECHNOLOGIES LTD', cardX + cardW / 2, y + 62, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Digital Transaction Receipt', cardX + cardW / 2, y + 80, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('STATUS : COMPLETED', cardX + cardW / 2, y + 98, { align: 'center' });
  y += 138;

  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(formatUGX(data.amount || 0), cardX + cardW / 2, y, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(107, 114, 128);
  doc.text(`${data.transaction_type || 'Cash Withdrawal'} • ${methodLabel}`, cardX + cardW / 2, y + 18, { align: 'center' });
  y += 44;

  const line = (label: string, value?: string | null) => {
    if (!value) return;
    doc.setDrawColor(229, 231, 235);
    doc.line(cardX, y, cardX + cardW, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(label, cardX, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text(String(value), cardX + cardW, y, { align: 'right' });
    y += 8;
  };

  line('Transaction Reference', data.receipt_number);
  line('Transaction ID (TID)', data.reference);
  line('Customer', data.recipient_name);
  if (isBank) {
    line('Bank', data.bank_name);
    line('Account Number', data.bank_account_number);
    line('Account Name', data.bank_account_name);
  } else if (isMoMo) {
    line('Provider', data.mobile_money_provider);
    line('Phone Number', data.mobile_money_number);
    line('Registered Name', data.mobile_money_name);
  }
  line('Merchant Agent', data.processor_name);
  line('Merchant Branch', data.merchant_branch);
  line('Date & Time', dateStr);

  y += 22;

  try {
    const qrDataUrl = await QRCode.toDataURL(publicUrl, { margin: 1, width: 220 });
    const qrSize = 120;
    doc.addImage(qrDataUrl, 'PNG', cardX + cardW / 2 - qrSize / 2, y, qrSize, qrSize);
    y += qrSize + 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text('Scan to verify this receipt', cardX + cardW / 2, y, { align: 'center' });
    y += 24;
  } catch { /* QR is best-effort */ }

  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text('Powered by Welile Receipts', cardX + cardW / 2, y, { align: 'center' });
  y += 14;
  doc.text('This receipt was generated electronically. No signature is required.', cardX + cardW / 2, y, { align: 'center' });
  y += 12;
  doc.text('Verify at welilereceipts.com', cardX + cardW / 2, y, { align: 'center' });

  doc.save(`welile-receipt-${data.receipt_number || data.reference || 'payout'}.pdf`);
}
