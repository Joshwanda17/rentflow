import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import {
  Loader2, CheckCircle2, ShieldCheck, Building2, Smartphone, Banknote,
  AlertTriangle, Clock, User, Phone, Hash,
} from 'lucide-react';

interface ReceiptData {
  paid: boolean;
  status?: string;
  amount?: number;
  payout_method?: string;
  reference?: string;
  processed_at?: string;
  recipient_name?: string;
  processor_name?: string;
  processor_phone?: string;
  reason?: string;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
  mobile_money_number?: string | null;
  mobile_money_name?: string | null;
  mobile_money_provider?: string | null;
}

/**
 * Public proof-of-payment receipt. Linked from the SMS the withdrawing user
 * receives once a merchant agent confirms their payout. Shows exactly who was
 * paid, how (bank account / MoMo number + names), the transaction ID, the
 * amount, the date & time, and which Welile agent processed it.
 * Route: /receipt/:id
 */
export default function PayoutReceipt() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReceiptData | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Missing receipt id');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: res, error: rpcErr } = await supabase.rpc('get_payout_receipt', {
          p_withdrawal_id: id,
        });
        if (rpcErr) throw rpcErr;
        if (!res) {
          setError('Receipt not found');
        } else {
          setData(res as unknown as ReceiptData);
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load receipt');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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
        day: 'numeric', month: 'long', year: 'numeric',
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

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4 flex justify-center">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-3xl shadow-xl overflow-hidden border border-border">
          {/* Header */}
          <div className="bg-primary text-primary-foreground px-6 pt-6 pb-8 text-center">
            <p className="text-lg font-extrabold tracking-widest mb-4">WELILE</p>
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-primary-foreground/15 mb-3">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="text-sm font-medium opacity-90">Payment Successful</p>
            <p className="text-4xl font-extrabold tabular-nums mt-1">{formatUGX(data.amount || 0)}</p>
            <div className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold">
              <MethodIcon className="h-3.5 w-3.5" /> {methodLabel}
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            <div className="divide-y divide-border">
              <Row icon={<User className="h-4 w-4" />} label="Paid to" value={data.recipient_name} />

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

              <Row icon={<Hash className="h-4 w-4" />} label="Transaction ID (TID)" value={data.reference} mono />
              <Row icon={<Clock className="h-4 w-4" />} label="Date & time" value={dateStr} />
              <Row icon={<User className="h-4 w-4" />} label="Processed by" value={data.processor_name} />
              <Row icon={<Phone className="h-4 w-4" />} label="Agent contact" value={data.processor_phone} mono />
            </div>

            {/* Verified footer */}
            <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold">Verified proof of payment issued by Welile</span>
            </div>

            <p className="text-center text-[11px] text-muted-foreground mt-4">
              Need help? Call or WhatsApp +256 777 607640
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}