import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Landmark, Loader2, PlusCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

interface FloatRequestRow {
  id: string;
  requested_amount: number;
  reason: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
}

const STATUS_META: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: 'Awaiting CFO', icon: Clock, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  approved: { label: 'Float sent', icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
  fulfilled: { label: 'Float sent', icon: CheckCircle2, className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
  rejected: { label: 'Rejected', icon: XCircle, className: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30' },
};

/**
 * Merchant-agent float requisition card.
 * A merchant agent pays cash-outs from their FLOAT bucket. When that float
 * runs low they raise a requisition here — it lands in the CFO's "Pay to
 * Wallet" queue, where the CFO fulfils it using the "Agent Float Allocation"
 * category (recipient_type = operational_wallet → Float bucket).
 */
export function MerchantFloatRequestCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { floatBalance, isLoading: balanceLoading } = useAgentBalances();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['my-float-requests', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<FloatRequestRow[]> => {
      const { data, error } = await supabase
        .from('float_requests')
        .select('id, requested_amount, reason, status, rejection_reason, created_at, approved_at')
        .eq('agent_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as FloatRequestRow[];
    },
    refetchInterval: 30_000,
  });

  const hasPending = requests.some((r) => r.status === 'pending');

  const submit = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 1000) throw new Error('Enter an amount of at least UGX 1,000.');
      if (amt > 20_000_000) throw new Error('Amount exceeds the UGX 20,000,000 float cap.');
      if (reason.trim().length < 5) throw new Error('Add a short reason (at least 5 characters).');
      if (hasPending) throw new Error('You already have a pending float request. Wait for the CFO to act on it.');
      const { error } = await supabase.from('float_requests').insert({
        agent_id: user!.id,
        requested_amount: amt,
        reason: reason.trim(),
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Float request sent to the CFO');
      setOpen(false);
      setAmount('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['my-float-requests', user?.id] });
    },
    onError: (e: any) => toast.error(e.message || 'Could not send request'),
  });

  return (
    <Card className="rounded-2xl border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Landmark className="h-4 w-4 text-sky-600" />
          Operational Float
        </CardTitle>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Available to pay cash-outs</p>
            <p className="text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-400">
              {balanceLoading ? '—' : formatUGX(floatBalance)}
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" disabled={hasPending}>
                <PlusCircle className="h-4 w-4" />
                {hasPending ? 'Request pending' : 'Request float'}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-sky-600" /> Request float top-up
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-1">
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-muted-foreground">
                  Your request goes straight to the CFO. They fund it under the
                  <span className="font-semibold text-foreground"> Agent Float Allocation </span>
                  category, which lands in your Float bucket.
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Amount (UGX)</label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 1,000,000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">Current float: {formatUGX(floatBalance)}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Reason</label>
                  <Textarea
                    placeholder="Why do you need more float? e.g. high cash-out volume today"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="gap-1.5">
                  {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send to CFO
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading your requests…</p>
        ) : requests.length === 0 ? (
          <p className="text-xs text-muted-foreground">No float requests yet.</p>
        ) : (
          requests.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.pending;
            const Icon = meta.icon;
            return (
              <div key={r.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card/50 p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tabular-nums">{formatUGX(Number(r.requested_amount))}</p>
                  {r.reason && <p className="truncate text-[11px] text-muted-foreground">{r.reason}</p>}
                  {r.status === 'rejected' && r.rejection_reason && (
                    <p className="text-[11px] text-red-600 dark:text-red-400">Reason: {r.rejection_reason}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Badge variant="outline" className={cn('shrink-0 gap-1 text-[10px]', meta.className)}>
                  <Icon className="h-3 w-3" /> {meta.label}
                </Badge>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default MerchantFloatRequestCard;