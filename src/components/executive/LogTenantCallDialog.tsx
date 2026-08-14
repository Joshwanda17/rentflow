import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PhoneCall, PhoneMissed, Loader2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { format } from 'date-fns';
import { useLogTenantCall, useTenantCallHistory, type TenantCallOutcome } from '@/hooks/useTenantCallReports';

interface Props {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
  tenantPhone?: string;
  rentRequestId?: string | null;
  missedDays: number;
  dailyRepayment: number;
  outstandingBalance: number;
}

/** Records one call attempt. History is append-only — nothing is overwritten. */
export function LogTenantCallDialog({
  open, onClose, tenantId, tenantName, tenantPhone, rentRequestId,
  missedDays, dailyRepayment, outstandingBalance,
}: Props) {
  const [outcome, setOutcome] = useState<TenantCallOutcome | null>(null);
  const [comment, setComment] = useState('');
  const logCall = useLogTenantCall();
  const { data: history, isLoading: histLoading } = useTenantCallHistory(open ? tenantId : null);

  const submit = async () => {
    if (!outcome) return;
    await logCall.mutateAsync({ tenantId, outcome, comment, rentRequestId });
    setOutcome(null);
    setComment('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Log call · {tenantName}</DialogTitle>
          <DialogDescription className="text-xs">
            {tenantPhone || 'No phone on file'} · {history?.length || 0} call{(history?.length || 0) === 1 ? '' : 's'} recorded
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-[10px] text-muted-foreground">Days missed</p>
            <p className="text-sm font-semibold">{missedDays}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-[10px] text-muted-foreground">Daily payment</p>
            <p className="text-sm font-semibold break-all">{formatUGX(dailyRepayment)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-[10px] text-muted-foreground">Total owed</p>
            <p className="text-sm font-semibold break-all">{formatUGX(outstandingBalance)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOutcome('picked_up')}
            className={`flex items-center justify-center gap-2 rounded-lg border py-3 text-xs font-medium transition-all ${
              outcome === 'picked_up' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600' : 'border-border text-muted-foreground'
            }`}
          >
            <PhoneCall className="h-4 w-4" /> Picked Up
          </button>
          <button
            onClick={() => setOutcome('missed')}
            className={`flex items-center justify-center gap-2 rounded-lg border py-3 text-xs font-medium transition-all ${
              outcome === 'missed' ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-border text-muted-foreground'
            }`}
          >
            <PhoneMissed className="h-4 w-4" /> Missed Call
          </button>
        </div>

        <Textarea
          placeholder="Comment (optional) — what the tenant said, agreed date, etc."
          value={comment}
          onChange={e => setComment(e.target.value)}
          rows={3}
          className="text-xs"
        />

        <Button onClick={submit} disabled={!outcome || logCall.isPending} className="w-full h-10 text-xs">
          {logCall.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save call record'}
        </Button>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground">Call history</p>
          {histLoading ? (
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          ) : !history?.length ? (
            <p className="text-[11px] text-muted-foreground">No calls recorded yet.</p>
          ) : (
            history.map(h => (
              <div key={h.id} className="rounded-lg border border-border/60 p-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 ${
                      h.outcome === 'picked_up'
                        ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                        : 'bg-destructive/15 text-destructive border-destructive/30'
                    }`}
                  >
                    {h.outcome === 'picked_up' ? 'Picked Up' : 'Missed Call'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(h.called_at), 'dd MMM yyyy · HH:mm')}
                  </span>
                </div>
                {h.comment && <p className="mt-1 text-[11px] text-foreground">{h.comment}</p>}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
