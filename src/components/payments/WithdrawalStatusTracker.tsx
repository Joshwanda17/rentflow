import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Clock, ShieldCheck, Banknote, X, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/paymentMethods';
import { cn } from '@/lib/utils';

interface WithdrawalStatusTrackerProps {
  /** withdrawal_requests.id — the actual UUID, not the REQ-XXXX shortcode. */
  requestId: string;
  /** Display amount on the receipt header. */
  amount: number;
  currency?: string;
  /** "MTN — 0770…" style label for the destination. */
  recipientLabel: string;
  /** REQ-XXXX shortcode shown to the user. */
  reference: string;
  onClose: () => void;
}

type WithdrawalRow = {
  status: string;
  created_at: string;
  manager_approved_at: string | null;
  fin_ops_approved_at: string | null;
  cfo_approved_at: string | null;
  processed_at: string | null;
  rejection_reason: string | null;
  transaction_id: string | null;
};

/** Maps the raw `status` text to a 3-stage UI tracker. Anything not in the
 * happy-path (rejected/cancelled) is rendered with its own terminal style. */
const STAGES: { id: 'submitted' | 'review' | 'disbursed'; label: string; description: string; Icon: typeof Clock }[] = [
  { id: 'submitted', label: 'Submitted', description: 'Your request is in the queue.', Icon: Clock },
  { id: 'review', label: 'Financial Ops review', description: 'A reviewer is verifying your details.', Icon: ShieldCheck },
  { id: 'disbursed', label: 'Funds released', description: 'Money sent to your destination.', Icon: Banknote },
];

export default function WithdrawalStatusTracker({
  requestId,
  amount,
  currency = 'UGX',
  recipientLabel,
  reference,
  onClose,
}: WithdrawalStatusTrackerProps) {
  const [row, setRow] = useState<WithdrawalRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  // Initial fetch + realtime subscription so the user sees Ops approve LIVE.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('withdrawal_requests')
        .select('status, created_at, manager_approved_at, fin_ops_approved_at, cfo_approved_at, processed_at, rejection_reason, transaction_id')
        .eq('id', requestId)
        .maybeSingle();
      if (!alive) return;
      setRow((data as WithdrawalRow) ?? null);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`withdrawal-${requestId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'withdrawal_requests', filter: `id=eq.${requestId}` },
        (payload) => {
          setRow(payload.new as WithdrawalRow);
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  const status = row?.status ?? 'pending';
  const isCancelled = status === 'cancelled';
  const isRejected = status === 'rejected';
  const isDisbursed = status === 'paid' || status === 'disbursed' || status === 'completed';
  // Heuristic for "Ops is reviewing" — any operational approval timestamp set
  // counts as having moved past the queue.
  const inReview =
    !!row?.manager_approved_at || !!row?.fin_ops_approved_at || !!row?.cfo_approved_at;

  const stageIndex = isDisbursed ? 2 : inReview ? 1 : 0;

  const handleCancel = async () => {
    if (!confirm('Cancel this withdrawal request? You can submit a new one anytime.')) return;
    setCancelling(true);
    const { error } = await supabase
      .from('withdrawal_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .eq('status', 'pending');
    setCancelling(false);
    if (error) {
      toast.error('Could not cancel — Financial Ops may already be processing it.');
      return;
    }
    toast.success('Withdrawal cancelled.');
  };

  if (loading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header — amount + ref */}
      <Card className="p-5 text-center bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          {isDisbursed ? 'Disbursed' : isRejected ? 'Rejected' : isCancelled ? 'Cancelled' : 'Pending approval'}
        </p>
        <p className="text-3xl font-bold mt-1">{formatCurrency(amount, currency)}</p>
        <p className="text-xs text-muted-foreground mt-2">to {recipientLabel}</p>
        <p className="text-[10px] font-mono text-muted-foreground mt-2">Ref: {reference}</p>
      </Card>

      {/* Rejected / cancelled banners */}
      {isRejected && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-destructive">Request rejected</p>
            {row?.rejection_reason && (
              <p className="text-muted-foreground mt-0.5">{row.rejection_reason}</p>
            )}
          </div>
        </div>
      )}
      {isCancelled && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/30">
          <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">You cancelled this request. Submit a new withdrawal anytime.</p>
        </div>
      )}

      {/* 3-stage tracker (hidden once terminal state is rejected/cancelled) */}
      {!isRejected && !isCancelled && (
        <div className="space-y-3">
          {STAGES.map((stage, i) => {
            const completed = i < stageIndex;
            const active = i === stageIndex && !isDisbursed;
            const done = i === stageIndex && isDisbursed;
            const Icon = stage.Icon;
            const stageTime =
              i === 0 ? row?.created_at :
              i === 1 ? (row?.manager_approved_at ?? row?.fin_ops_approved_at ?? row?.cfo_approved_at) :
              row?.processed_at;
            return (
              <div key={stage.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                      completed || done ? 'bg-emerald-500 text-white' :
                      active ? 'bg-primary/15 text-primary ring-2 ring-primary/40 animate-pulse' :
                      'bg-muted text-muted-foreground',
                    )}
                  >
                    {completed || done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className={cn('w-px flex-1 my-1', completed ? 'bg-emerald-500' : 'bg-border')} style={{ minHeight: 24 }} />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('text-sm font-semibold', (completed || active || done) && 'text-foreground', !(completed || active || done) && 'text-muted-foreground')}>
                      {stage.label}
                    </p>
                    {stageTime && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {format(new Date(stageTime), 'MMM d, HH:mm')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>
                  {active && i === 1 && (
                    <p className="text-[10px] text-primary mt-1 font-medium">May take up to 24 hours. Sometimes instant depending on volume.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Disbursement TID once available */}
      {isDisbursed && row?.transaction_id && (
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs">
          <p className="text-muted-foreground">Provider transaction ID</p>
          <p className="font-mono font-semibold text-emerald-700 break-all">{row.transaction_id}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {status === 'pending' && !inReview && (
          <Button
            variant="outline"
            className="flex-1 text-destructive hover:bg-destructive/5 border-destructive/30"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
            Cancel request
          </Button>
        )}
        <Button onClick={onClose} className="flex-1">Done</Button>
      </div>

      <p className="text-[10px] text-center text-muted-foreground">
        🔔 We'll notify you the moment Financial Ops approves and funds are released.
      </p>
    </div>
  );
}