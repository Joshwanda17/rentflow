import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { QRCodeCanvas } from 'qrcode.react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import { Loader2, AlertTriangle, Clock, Download, ScanLine } from 'lucide-react';
import welileMark from '@/assets/welile-mark-white.png';

interface ReceiptData {
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

/**
 * Public proof-of-payment receipt. Opens instantly from the SMS link a customer
 * receives once a merchant agent confirms their payout — no sign-in, no redirect.
 * Reached via an unguessable token (/r/:token) or, for authenticated in-app use,
 * by withdrawal id (/receipt/:id). Shows who was paid, how, the TID, amount,
 * commission, branch, date/time and the processing agent, plus a QR code that
 * resolves back to the same URL and a one-tap PDF download.
 */
export default function PayoutReceipt() {
  const { id, token } = useParams<{ id?: string; token?: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReceiptData | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id && !token) {
      setError('Missing receipt reference');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: res, error: rpcErr } = token
          ? await supabase.rpc('get_payout_receipt_by_token' as any, { p_token: token })
          : await supabase.rpc('get_payout_receipt', { p_withdrawal_id: id as string });
        if (rpcErr) throw rpcErr;
        if (!res) setError('Receipt not found');
        else setData(res as unknown as ReceiptData);
      } catch (e: any) {
        setError(e.message || 'Failed to load receipt');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, token]);

  // Canonical public URL for this receipt — used by the QR code and PDF.
  const publicUrl = data?.receipt_token
    ? `https://welilereceipts.com/r/${data.receipt_token}`
    : (typeof window !== 'undefined' ? window.location.href : '');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-lg font-semibold">Receipt unavailable</p>
        <p className="text-sm text-muted-foreground mt-1">{error || 'This receipt could not be found.'}</p>
      </div>
    );
  }

  if (!data.paid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6 text-center">
        <Clock className="h-10 w-10 text-amber-500 mb-3" />
        <p className="text-lg font-semibold">Payment not completed yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          This withdrawal has not been paid. A receipt will appear here once it is processed.
        </p>
      </div>
    );
  }

  const pm = (data.payout_method || '').toLowerCase();
  const isBank = pm.includes('bank');
  const isMoMo = pm.includes('momo') || pm.includes('mobile') || pm.includes('mtn') || pm.includes('airtel');
  const MethodIcon = isBank ? Building2 : isMoMo ? Smartphone : Banknote;
  const methodLabel = isBank ? 'Bank Transfer' : isMoMo ? 'Mobile Money' : 'Cash';

  const paidAt = data.processed_at ? new Date(data.processed_at) : null;
  const dateStr = paidAt
    ? paidAt.toLocaleString('en-UG', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

  const Row = ({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value?: string | null; mono?: boolean }) =>
    value ? (
      <div className="flex items-start justify-between gap-3 py-2.5">
        <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5 shrink-0">
          {icon}{label}
        </span>
        <span className={`text-sm font-semibold text-right break-words ${mono ? 'font-mono tracking-wide' : ''}`}>{value}</span>
      </div>
    ) : null;

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const cardX = 48;
      const cardW = pageW - cardX * 2;
      let y = 56;

      // Brand header band
      doc.setFillColor(124, 58, 237); // welile purple
      doc.roundedRect(cardX, y, cardW, 88, 10, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('WELILE TECHNOLOGIES LTD', cardX + cardW / 2, y + 30, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text('Digital Transaction Receipt', cardX + cardW / 2, y + 50, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('STATUS: COMPLETED', cardX + cardW / 2, y + 72, { align: 'center' });
      y += 118;

      // Amount
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

      // QR code
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
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4 flex justify-center">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-3xl shadow-xl overflow-hidden border border-border">
          {/* Header */}
          <div className="bg-primary text-primary-foreground px-6 pt-6 pb-8 text-center">
            <p className="text-sm font-extrabold tracking-widest mb-1">WELILE TECHNOLOGIES LTD</p>
            <p className="text-[11px] opacity-80 mb-4">Digital Transaction Receipt</p>
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary-foreground/15 mb-3">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/25 px-3 py-1 text-xs font-bold tracking-wide">
              <ShieldCheck className="h-3.5 w-3.5" /> COMPLETED
            </div>
            <p className="text-4xl font-extrabold tabular-nums mt-3">{formatUGX(data.amount || 0)}</p>
            <div className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold">
              <MethodIcon className="h-3.5 w-3.5" /> {data.transaction_type || 'Cash Withdrawal'} • {methodLabel}
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            <div className="divide-y divide-border">
              <Row icon={<Hash className="h-4 w-4" />} label="Reference" value={data.receipt_number} mono />
              <Row icon={<Hash className="h-4 w-4" />} label="Transaction ID (TID)" value={data.reference} mono />
              <Row icon={<User className="h-4 w-4" />} label="Customer" value={data.recipient_name} />

              {isBank && (
                <>
                  <Row label="Bank" value={data.bank_name} />
                  <Row icon={<Hash className="h-4 w-4" />} label="Account number" value={data.bank_account_number} mono />
                  <Row label="Account name" value={data.bank_account_name} />
                </>
              )}

              {isMoMo && (
                <>
                  {data.mobile_money_provider && <Row label="Provider" value={data.mobile_money_provider} />}
                  <Row icon={<Phone className="h-4 w-4" />} label="Phone number" value={data.mobile_money_number} mono />
                  <Row label="Registered name" value={data.mobile_money_name} />
                </>
              )}

              <Row icon={<User className="h-4 w-4" />} label="Merchant agent" value={data.processor_name} />
              <Row icon={<Store className="h-4 w-4" />} label="Merchant branch" value={data.merchant_branch} />
              <Row icon={<Phone className="h-4 w-4" />} label="Agent contact" value={data.processor_phone} mono />
              <Row icon={<Clock className="h-4 w-4" />} label="Date & time" value={dateStr} />
            </div>

            {/* QR code */}
            <div className="mt-5 flex flex-col items-center gap-2">
              <div className="rounded-xl bg-white p-3 border border-border">
                <QRCodeCanvas value={publicUrl} size={128} includeMargin={false} />
              </div>
              <p className="text-[11px] text-muted-foreground">Scan to verify this receipt</p>
            </div>

            {/* Download */}
            <button
              onClick={downloadPdf}
              disabled={downloading}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold disabled:opacity-60"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? 'Preparing PDF…' : 'Download PDF receipt'}
            </button>

            {/* Verified footer */}
            <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold text-center">
                Verified proof of payment • Generated electronically • No signature required
              </span>
            </div>

            <p className="text-center text-[11px] text-muted-foreground mt-4">
              Powered by Welile Receipts · Verify at welilereceipts.com
            </p>
            <p className="text-center text-[11px] text-muted-foreground mt-1">
              Need help? Call or WhatsApp +256 777 607640
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
