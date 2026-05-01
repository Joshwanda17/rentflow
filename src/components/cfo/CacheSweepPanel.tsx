import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Broom, AlertTriangle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { extractEdgeFunctionError } from '@/lib/extractEdgeFunctionError';

interface DriftRow {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  cached_withdrawable: number;
  cached_float: number;
  strict_withdrawable: number;
  cached_overstatement: number;
}

type Bucket = 'withdrawable' | 'float';

/**
 * CFO Cache Sweep — the only audited path that can reduce a phantom cached
 * wallet bucket without moving real customer money. Lists every wallet whose
 * cached withdrawable exceeds the strict ledger position and lets CFO sweep
 * up to that delta. Float phantom (cached_float vs derived float) handled
 * via the same dialog.
 */
export default function CacheSweepPanel() {
  const queryClient = useQueryClient();
  const [minDelta, setMinDelta] = useState('1000');
  const [target, setTarget] = useState<{ row: DriftRow; bucket: Bucket } | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ['cache-sweep-drift', minDelta],
    queryFn: async () => {
      const min = Math.max(1, Number(minDelta) || 1);
      const { data, error } = await supabase
        .from('wallet_strict_drift_view')
        .select('user_id, full_name, phone, cached_withdrawable, cached_float, strict_withdrawable, cached_overstatement')
        .gte('cached_overstatement', min)
        .order('cached_overstatement', { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        user_id: r.user_id,
        full_name: r.full_name,
        phone: r.phone,
        cached_withdrawable: Number(r.cached_withdrawable ?? 0),
        cached_float: Number(r.cached_float ?? 0),
        strict_withdrawable: Number(r.strict_withdrawable ?? 0),
        cached_overstatement: Number(r.cached_overstatement ?? 0),
      })) as DriftRow[];
    },
    staleTime: 0,
  });

  const totalPhantom = useMemo(
    () => (rows ?? []).reduce((s, r) => s + r.cached_overstatement, 0),
    [rows],
  );

  const sweep = useMutation({
    mutationFn: async (input: { user_id: string; bucket: Bucket; amount: number; reason: string }) => {
      const { data, error } = await supabase.functions.invoke('wallet-cache-sweep', {
        body: {
          target_user_id: input.user_id,
          bucket: input.bucket,
          amount: input.amount,
          reason: input.reason,
        },
      });
      if (error || data?.error) {
        const msg = await extractEdgeFunctionError({ error, data }, 'Cache sweep failed');
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Swept ${formatUGX(data.amount_swept)} of phantom ${data.bucket}.`);
      setTarget(null);
      setAmount('');
      setReason('');
      void refetch();
      queryClient.invalidateQueries({ queryKey: ['anchored-cache-drift'] });
      queryClient.invalidateQueries({ queryKey: ['phantom-drift'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const phantomForTarget = target
    ? target.bucket === 'withdrawable'
      ? Math.max(0, target.row.cached_withdrawable - target.row.strict_withdrawable)
      : target.row.cached_float // strict float not in this view; conservative cap
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Broom className="h-5 w-5 text-primary" />
          Cache Sweep — Reduce phantom wallet balances
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Only place a cached <code>wallets.*</code> figure can be reduced without a real money movement.
          Hard-capped at <strong>cached − strict</strong>; cannot ever touch customer-owed funds. Posts under
          <code className="mx-1">classification=admin_correction</code>so end-user wallet views are unaffected.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs font-semibold text-muted-foreground">Min phantom (UGX)</label>
          <Input
            value={minDelta}
            onChange={(e) => setMinDelta(e.target.value)}
            className="w-32 h-8"
          />
          <Button size="sm" variant="outline" onClick={() => refetch()}>Refresh</Button>
          <div className="ml-auto text-sm">
            <span className="text-muted-foreground">Total phantom: </span>
            <span className="font-bold">{formatUGX(totalPhantom)}</span>
            <span className="text-muted-foreground ml-2">across {rows?.length ?? 0} wallets</span>
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading drift…
          </div>
        ) : (rows ?? []).length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No phantom drift detected at this threshold.
          </div>
        ) : (
          <div className="border rounded-xl divide-y max-h-[520px] overflow-y-auto">
            {rows!.map((r) => (
              <div key={r.user_id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{r.full_name || 'Unnamed'}</p>
                  <p className="text-xs text-muted-foreground">{r.phone}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">
                      Cached W: {formatUGX(r.cached_withdrawable)}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      Strict W: {formatUGX(r.strict_withdrawable)}
                    </Badge>
                    {r.cached_float > 0 && (
                      <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">
                        Cached F: {formatUGX(r.cached_float)}
                      </Badge>
                    )}
                    <Badge className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                      Phantom: {formatUGX(r.cached_overstatement)}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setTarget({ row: r, bucket: 'withdrawable' });
                      setAmount(String(Math.max(0, r.cached_withdrawable - r.strict_withdrawable)));
                      setReason('');
                    }}
                    disabled={r.cached_withdrawable <= r.strict_withdrawable}
                  >
                    Sweep Withdrawable
                  </Button>
                  {r.cached_float > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTarget({ row: r, bucket: 'float' });
                        setAmount(String(r.cached_float));
                        setReason('');
                      }}
                    >
                      Sweep Float
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirm Cache Sweep
            </DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-3 text-sm">
              <p>
                Reducing <strong>{target.row.full_name || 'Unnamed'}</strong>'s cached
                {' '}<Badge>{target.bucket}</Badge> bucket.
              </p>
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
                <p>Cached: <strong>{formatUGX(target.bucket === 'withdrawable' ? target.row.cached_withdrawable : target.row.cached_float)}</strong></p>
                {target.bucket === 'withdrawable' && (
                  <p>Strict ledger: <strong>{formatUGX(target.row.strict_withdrawable)}</strong></p>
                )}
                <p className="text-destructive">Max sweepable (phantom): <strong>{formatUGX(phantomForTarget)}</strong></p>
              </div>
              <div>
                <label className="text-xs font-semibold">Amount to sweep (UGX)</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Reason (≥10 chars, audit-mandatory)</label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={
                !target ||
                sweep.isPending ||
                Number(amount) <= 0 ||
                Number(amount) > phantomForTarget ||
                reason.trim().length < 10
              }
              onClick={() =>
                target &&
                sweep.mutate({
                  user_id: target.row.user_id,
                  bucket: target.bucket,
                  amount: Number(amount),
                  reason: reason.trim(),
                })
              }
            >
              {sweep.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Sweep'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}