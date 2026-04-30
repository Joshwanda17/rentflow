import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, RefreshCw, ScaleIcon, ShieldCheck, Wand2, AlertTriangle } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type DriftDirection = 'in_sync' | 'phantom_air' | 'hidden_owed';

interface TruthRow {
  user_id: string;
  full_name: string | null;
  cached_balance: number;
  cached_withdrawable: number;
  cached_float: number;
  cached_advance: number;
  ledger_net: number;
  drift_amount: number;
  drift_direction: DriftDirection;
  updated_at: string;
}

const DIR_BADGE: Record<DriftDirection, string> = {
  in_sync: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  phantom_air: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  hidden_owed: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
};

export function LedgerReconciliationPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<DriftDirection | 'drifting' | 'all'>('drifting');
  const [search, setSearch] = useState('');
  const [reasonOpen, setReasonOpen] = useState<TruthRow | null>(null);
  const [reason, setReason] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState('');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['wallet-ledger-truth', filter],
    queryFn: async () => {
      let q = supabase
        .from('wallet_ledger_truth_view' as never)
        .select('*')
        .order('drift_amount', { ascending: false });

      if (filter === 'drifting') {
        q = q.neq('drift_direction', 'in_sync');
      } else if (filter !== 'all') {
        q = q.eq('drift_direction', filter);
      }

      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as TruthRow[];
    },
    refetchInterval: 60_000,
  });

  const reconcileOne = useMutation({
    mutationFn: async ({ user_id, reason }: { user_id: string; reason: string }) => {
      const { data, error } = await supabase.rpc('reconcile_wallet_from_ledger', {
        p_user_id: user_id,
        p_reason: reason,
      });
      if (error) throw error;
      return data as { status: string; delta: number; direction: string };
    },
    onSuccess: (res) => {
      toast.success(
        res.status === 'already_in_sync'
          ? 'Wallet already matches ledger'
          : `Reconciled — ${res.direction} of ${formatUGX(Math.abs(Number(res.delta)))}`,
      );
      qc.invalidateQueries({ queryKey: ['wallet-ledger-truth'] });
      qc.invalidateQueries({ queryKey: ['phantom-drift'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      setReasonOpen(null);
      setReason('');
    },
    onError: (e: Error) => toast.error(`Reconciliation failed: ${e.message}`),
  });

  const reconcileBulk = useMutation({
    mutationFn: async (reason: string) => {
      const targets = (data ?? []).filter((r) => r.drift_direction !== 'in_sync');
      let ok = 0;
      let failed = 0;
      // Sequential to keep ledger rows ordered + stay under DB connection pressure
      for (const t of targets) {
        try {
          const { error } = await supabase.rpc('reconcile_wallet_from_ledger', {
            p_user_id: t.user_id,
            p_reason: reason,
          });
          if (error) throw error;
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      return { ok, failed, total: targets.length };
    },
    onSuccess: (res) => {
      toast.success(`Bulk reconcile: ${res.ok}/${res.total} succeeded${res.failed ? ` (${res.failed} failed)` : ''}`);
      qc.invalidateQueries({ queryKey: ['wallet-ledger-truth'] });
      qc.invalidateQueries({ queryKey: ['phantom-drift'] });
      qc.invalidateQueries({ queryKey: ['wallet'] });
      setBulkOpen(false);
      setBulkReason('');
    },
    onError: (e: Error) => toast.error(`Bulk reconciliation failed: ${e.message}`),
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (r.full_name ?? '').toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q),
    );
  }, [data, search]);

  const summary = useMemo(() => {
    const rows = data ?? [];
    const drifting = rows.filter((r) => r.drift_direction !== 'in_sync');
    const phantom = drifting
      .filter((r) => r.drift_direction === 'phantom_air')
      .reduce((s, r) => s + Number(r.drift_amount || 0), 0);
    const owed = drifting
      .filter((r) => r.drift_direction === 'hidden_owed')
      .reduce((s, r) => s + Math.abs(Number(r.drift_amount || 0)), 0);
    return { driftCount: drifting.length, phantom, owed };
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScaleIcon className="h-5 w-5 text-primary" />
              Ledger Truth Reconciliation
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Replays the all-time double-entry ledger and aligns each cached wallet to the truth via balanced
              <code className="px-1 mx-1 rounded bg-muted">system_balance_correction</code> entries.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant="default"
              disabled={summary.driftCount === 0 || reconcileBulk.isPending}
              onClick={() => setBulkOpen(true)}
            >
              {reconcileBulk.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Reconcile All ({summary.driftCount})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Drifting Wallets" value={String(summary.driftCount)} tone={summary.driftCount > 0 ? 'warn' : 'ok'} />
          <Stat label="Phantom Air (cache > ledger)" value={formatUGX(summary.phantom)} tone={summary.phantom > 0 ? 'warn' : 'ok'} />
          <Stat label="Hidden Owed (ledger > cache)" value={formatUGX(summary.owed)} tone={summary.owed > 0 ? 'warn' : 'ok'} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="drifting">Drifting only</SelectItem>
              <SelectItem value="phantom_air">Phantom air (cache &gt; ledger)</SelectItem>
              <SelectItem value="hidden_owed">Hidden owed (ledger &gt; cache)</SelectItem>
              <SelectItem value="in_sync">In sync</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Search name or user id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[260px]"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
            No wallets match the current filter — ledger and cache are aligned.
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">User</th>
                    <th className="text-right p-2">Cached</th>
                    <th className="text-right p-2">Withdrawable / Float / Advance</th>
                    <th className="text-right p-2">Ledger Net</th>
                    <th className="text-right p-2">Drift</th>
                    <th className="text-left p-2">Direction</th>
                    <th className="text-left p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const drift = Number(r.drift_amount || 0);
                    return (
                      <tr key={r.user_id} className="border-t border-border hover:bg-muted/30">
                        <td className="p-2">
                          <div className="font-medium">{r.full_name ?? '—'}</div>
                          <div className="text-muted-foreground">{r.user_id.slice(0, 8)}</div>
                        </td>
                        <td className="p-2 text-right tabular-nums">{formatUGX(Number(r.cached_balance))}</td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">
                          {formatUGX(Number(r.cached_withdrawable))} / {formatUGX(Number(r.cached_float))} / {formatUGX(Number(r.cached_advance))}
                        </td>
                        <td className="p-2 text-right tabular-nums">{formatUGX(Number(r.ledger_net))}</td>
                        <td className={cn('p-2 text-right tabular-nums font-semibold', drift > 0 ? 'text-orange-600' : drift < 0 ? 'text-blue-600' : '')}>
                          {drift > 0 ? '+' : ''}{formatUGX(drift)}
                        </td>
                        <td className="p-2">
                          <Badge className={cn('text-[10px] border', DIR_BADGE[r.drift_direction])} variant="outline">
                            {r.drift_direction.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {r.drift_direction !== 'in_sync' && (
                            <Button
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => { setReasonOpen(r); setReason(''); }}
                            >
                              <Wand2 className="h-3 w-3 mr-1" />
                              Reconcile
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>

      {/* Per-row reconciliation dialog */}
      <Dialog open={!!reasonOpen} onOpenChange={(o) => { if (!o) { setReasonOpen(null); setReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Reconcile to Ledger Truth
            </DialogTitle>
            <DialogDescription>
              {reasonOpen && (
                <span className="block space-y-1 text-foreground">
                  <span className="block"><strong>{reasonOpen.full_name ?? reasonOpen.user_id.slice(0, 8)}</strong></span>
                  <span className="block text-sm">Cached balance: <strong>{formatUGX(Number(reasonOpen.cached_balance))}</strong></span>
                  <span className="block text-sm">Ledger net: <strong>{formatUGX(Number(reasonOpen.ledger_net))}</strong></span>
                  <span className="block text-sm">
                    Will post a balanced{' '}
                    <strong>{Number(reasonOpen.drift_amount) > 0 ? 'write-down' : 'release'}</strong>{' '}
                    of <strong>{formatUGX(Math.abs(Number(reasonOpen.drift_amount)))}</strong>.
                  </span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reason (≥10 characters, audit-logged)
            </label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Phase 1 production reconciliation — aligning cache to all-time double-entry ledger"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReasonOpen(null); setReason(''); }}>Cancel</Button>
            <Button
              disabled={reason.trim().length < 10 || reconcileOne.isPending || !reasonOpen}
              onClick={() => reasonOpen && reconcileOne.mutate({ user_id: reasonOpen.user_id, reason: reason.trim() })}
            >
              {reconcileOne.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm Reconciliation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk reconciliation dialog */}
      <Dialog open={bulkOpen} onOpenChange={(o) => { if (!o) { setBulkOpen(false); setBulkReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Reconcile All Drifting Wallets
            </DialogTitle>
            <DialogDescription>
              <span className="block space-y-1 text-foreground">
                <span className="block">This will run reconciliation against <strong>{summary.driftCount}</strong> wallets.</span>
                <span className="block text-sm">Phantom air to write down: <strong>{formatUGX(summary.phantom)}</strong></span>
                <span className="block text-sm">Hidden owed to release: <strong>{formatUGX(summary.owed)}</strong></span>
                <span className="block text-sm">Each wallet gets a balanced ledger pair and an audit_logs entry sharing this reason.</span>
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Reason (≥10 characters, recorded on every wallet)
            </label>
            <Textarea
              rows={3}
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="e.g. Production launch reconciliation — aligning all wallets to ledger truth"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setBulkOpen(false); setBulkReason(''); }}>Cancel</Button>
            <Button
              disabled={bulkReason.trim().length < 10 || reconcileBulk.isPending}
              onClick={() => reconcileBulk.mutate(bulkReason.trim())}
            >
              {reconcileBulk.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Run Bulk Reconciliation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'danger' }) {
  const toneCls =
    tone === 'danger' ? 'border-red-500/30 bg-red-500/5 text-red-700' :
    tone === 'warn' ? 'border-orange-500/30 bg-orange-500/5 text-orange-700' :
    'border-emerald-500/30 bg-emerald-500/5 text-emerald-700';
  return (
    <div className={cn('rounded-lg border px-3 py-2', toneCls)}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default LedgerReconciliationPanel;