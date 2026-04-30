import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, RefreshCw, AlertTriangle, Wand2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';

interface AnchoredDriftRow {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  cached_withdrawable: number;
  cached_float: number;
  cached_total: number;
  strict_available: number;
  over_cache_delta: number;
  anchor_at: string;
  pre_anchor_ledger_net: number;
  anchor_reason: string | null;
}

/**
 * Anchored-Cache Drift — wallets carrying a fresh-start anchor whose cached
 * withdrawable bucket sits above the strict ledger-true available balance.
 * Each row exposes a CFO "Reseed" action that reduces the cached bucket to
 * the strict figure and records the over-cache delta into
 * wallet_historical_drift_review for an explicit release / write-down audit.
 */
export function AnchoredCacheDriftPanel() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<AnchoredDriftRow | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['anchored-cache-drift'],
    queryFn: async (): Promise<AnchoredDriftRow[]> => {
      const { data, error } = await supabase
        .from('wallet_anchored_drift_view' as unknown as never)
        .select('*')
        .order('over_cache_delta', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as AnchoredDriftRow[];
    },
    refetchInterval: 60_000,
  });

  const reseed = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error('No user selected');
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');
      const { data, error } = await supabase.rpc('reseed_anchored_withdrawable' as never, {
        p_user_id: target.user_id,
        p_reason: reason.trim(),
      } as never);
      if (error) throw error;
      return data as { delta_cleared?: number };
    },
    onSuccess: (res) => {
      toast.success(
        `Reseed posted. Cleared ${formatUGX(Number(res?.delta_cleared ?? 0))}`,
      );
      setTarget(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['anchored-cache-drift'] });
      qc.invalidateQueries({ queryKey: ['deduction-balance-search'] });
      qc.invalidateQueries({ queryKey: ['historical-drift-review'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalDelta = (data ?? []).reduce((s, r) => s + Number(r.over_cache_delta || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Anchored-Cache Drift
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Anchored wallets where the cached withdrawable bucket sits above the strict ledger-true available figure.
            Reseeding reduces the cache to match the strict figure and logs the delta for release / write-down review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {(data?.length ?? 0)} wallets · {formatUGX(totalDelta)} over-cache
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-8 px-2"
          >
            <RefreshCw className={isRefetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            No anchored wallets with cache drift. Healthy.
          </div>
        ) : (
          <div className="divide-y border rounded-lg overflow-hidden">
            {(data ?? []).map((row) => (
              <div key={row.user_id} className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{row.full_name || 'Unnamed'}</p>
                  <p className="text-xs text-muted-foreground">{row.phone || '—'}</p>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Cached: <span className="font-medium text-foreground">{formatUGX(row.cached_withdrawable)}</span>
                    {' · '}Strict: <span className="font-medium text-foreground">{formatUGX(row.strict_available)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-amber-700">Over-cache</p>
                    <p className="text-sm font-semibold text-amber-700">
                      {formatUGX(row.over_cache_delta)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => { setTarget(row); setReason(''); }}
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Reseed
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reseed cached withdrawable</DialogTitle>
            <DialogDescription>
              {target ? (
                <>
                  Reduce <span className="font-medium">{target.full_name || 'this user'}</span>'s
                  cached withdrawable from <span className="font-medium">{formatUGX(target.cached_withdrawable)}</span>{' '}
                  to the strict <span className="font-medium">{formatUGX(target.strict_available)}</span>.
                  This posts a balanced ledger correction for{' '}
                  <span className="font-semibold text-amber-700">{formatUGX(target.over_cache_delta)}</span>{' '}
                  and adds a row to Historical Drift Review for release / write-down.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Reason (min. 10 characters)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this cache is being reseeded (audit trail)"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={reseed.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => reseed.mutate()}
              disabled={reseed.isPending || reason.trim().length < 10}
            >
              {reseed.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm reseed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default AnchoredCacheDriftPanel;