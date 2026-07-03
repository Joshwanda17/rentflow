import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Landmark, Loader2, PlusCircle, Clock, AlertTriangle } from 'lucide-react';
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

const LOW_FLOAT_THRESHOLD = 100_000;

/**
 * Compact single "Available Float" card. A merchant agent pays cash-outs from
 * their FLOAT bucket. When that float drops below UGX 100,000 a "Request float"
 * button appears — it lands in the CFO's "Pay to Wallet" queue, where the CFO
 * fulfils it using the "Agent Float Allocation" category
 * (recipient_type = operational_wallet → Float bucket).
 */
export function MerchantFloatRequestCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { floatBalance, isLoading: balanceLoading } = useAgentBalances();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const { data: requests = [] } = useQuery({
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
  const isLow = !balanceLoading && floatBalance < LOW_FLOAT_THRESHOLD;
  const showRequest = isLow || hasPending;

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
    <Card
      className={cn(
        'flex items-center justify-between gap-3 rounded-2xl border p-3.5',
        isLow
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-sky-500/20 bg-gradient-to-br from-sky-500/5 to-transparent',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Landmark className="h-3.5 w-3.5 text-sky-600" /> Available Float
        </div>
        <p
          className={cn(
            'mt-1 text-2xl font-bold leading-tight tabular-nums',
            isLow ? 'text-amber-700 dark:text-amber-400' : 'text-sky-700 dark:text-sky-400',
          )}
        >
          {balanceLoading ? '—' : formatUGX(floatBalance)}
        </p>
        {isLow && (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Low float — request a top-up to keep paying
          </p>
        )}
        {hasPending && (
          <Badge variant="outline" className="mt-1 gap-1 border-amber-500/30 bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-400">
            <Clock className="h-3 w-3" /> Request awaiting CFO
          </Badge>
        )}
      </div>

      {showRequest && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0 gap-1.5" disabled={hasPending}>
              <PlusCircle className="h-4 w-4" />
              {hasPending ? 'Pending' : 'Request float'}
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
      )}
    </Card>
  );
}

export default MerchantFloatRequestCard;