import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { Check, X, RefreshCw } from 'lucide-react';

interface PendingRow {
  pending_id: string;
  portfolio_id: string;
  portfolio_code: string;
  funder_id: string;
  funder_name: string | null;
  funder_email: string | null;
  funder_phone: string | null;
  amount: number;
  source: string;
  term_months: number;
  lines_count: number;
  created_at: string;
  waiting_days: number;
}

export function PendingPortfoliosQueue() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectRow, setRejectRow] = useState<PendingRow | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['partner-ops-pending-portfolios'],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('partner_ops_pending_portfolios' as any);
      if (error) throw error;
      return ((data as any[]) || []) as PendingRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['partner-ops-pending-portfolios'] });
    qc.invalidateQueries({ queryKey: ['partner-ops-pending-portfolio-summary'] });
  };

  const approve = async (row: PendingRow) => {
    setBusyId(row.pending_id);
    // Route through the edge function so the confirmation email is dispatched
    // (self-managed portfolios get the dedicated deployment template).
    const { data: res, error } = await supabase.functions.invoke('approve-pending-portfolio', {
      body: { portfolio_id: row.portfolio_id },
    });
    setBusyId(null);
    if (error || (res as any)?.error) {
      toast.error((res as any)?.error || error?.message || 'Approval failed');
      return;
    }
    toast.success(`Portfolio ${row.portfolio_code} approved and funded`);
    invalidate();
  };

  const reject = async () => {
    if (!rejectRow) return;
    if (reason.trim().length < 10) { toast.error('Give a reason of at least 10 characters'); return; }
    setBusyId(rejectRow.pending_id);
    const { error } = await supabase.rpc('reject_pending_portfolio' as any, {
      p_portfolio_id: rejectRow.portfolio_id,
      p_reason: reason.trim(),
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Portfolio rejected and capital released');
    setRejectRow(null);
    setReason('');
    invalidate();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-foreground">Portfolios awaiting approval</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-semibold text-destructive">
            Pending queue failed to load: {(error as Error).message}
          </p>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading pending portfolios…</p>}

      {!isLoading && (data?.length ?? 0) === 0 && !isError && (
        <p className="text-sm text-muted-foreground">No portfolios are awaiting approval.</p>
      )}

      <div className="space-y-2">
        {(data || []).map(row => (
          <div key={row.pending_id} className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {row.funder_name || row.funder_email || row.funder_id}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {row.portfolio_code} · {row.funder_phone || row.funder_email || '—'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black text-foreground tabular-nums">{formatUGX(Number(row.amount))}</p>
                <p className="text-[10px] text-muted-foreground">{row.term_months} mo</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {row.source === 'self_managed' ? `Self managed · ${row.lines_count} plans` : 'Rent pool'}
              </Badge>
              <Badge variant={row.waiting_days > 2 ? 'destructive' : 'outline'} className="text-[10px]">
                Waiting {row.waiting_days}d
              </Badge>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm" className="gap-1.5"
                disabled={busyId === row.pending_id}
                onClick={() => approve(row)}
              >
                <Check className="h-3.5 w-3.5" /> Approve &amp; fund
              </Button>
              <Button
                size="sm" variant="destructive" className="gap-1.5"
                disabled={busyId === row.pending_id}
                onClick={() => { setRejectRow(row); setReason(''); }}
              >
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!rejectRow} onOpenChange={(o) => { if (!o) { setRejectRow(null); setReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this portfolio</DialogTitle>
            <DialogDescription>
              The portfolio is cancelled, any reserved rent plans return to the queue and the funder's money stays in their wallet.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being rejected? (minimum 10 characters)"
            rows={4}
          />
          <p className="text-[11px] text-muted-foreground">{reason.trim().length}/10 characters</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectRow(null); setReason(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={reason.trim().length < 10 || !!busyId}>
              Reject portfolio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
