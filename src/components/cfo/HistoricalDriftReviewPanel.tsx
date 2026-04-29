import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, RefreshCw, ShieldAlert, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ReviewStatus = 'pending_review' | 'approved_release' | 'approved_writedown' | 'escalated';

interface ReviewRow {
  id: string;
  user_id: string;
  cached_withdrawable: number;
  pre_anchor_ledger_net: number;
  phantom_amount: number;
  status: ReviewStatus;
  cfo_decision: string | null;
  decided_at: string | null;
  profile?: { full_name: string | null; phone: string | null } | null;
}

const STATUS_COLOR: Record<ReviewStatus, string> = {
  pending_review: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  approved_release: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  approved_writedown: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
  escalated: 'bg-red-500/15 text-red-700 border-red-500/30',
};

type ActionMode = 'release' | 'writedown';

export default function HistoricalDriftReviewPanel() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('pending_review');
  const [activeRow, setActiveRow] = useState<ReviewRow | null>(null);
  const [mode, setMode] = useState<ActionMode>('release');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['historical-drift-review', statusFilter],
    queryFn: async () => {
      const q = supabase
        .from('wallet_historical_drift_review')
        .select('id, user_id, cached_withdrawable, pre_anchor_ledger_net, phantom_amount, status, cfo_decision, decided_at')
        .order('phantom_amount', { ascending: false });
      const { data, error } = statusFilter === 'all' ? await q : await q.eq('status', statusFilter);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as ReviewRow[];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', ids);
      const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((r) => ({
        ...r,
        profile: pmap.get(r.user_id) ?? null,
      })) as ReviewRow[];
    },
  });

  const summary = useMemo(() => {
    const rows = data ?? [];
    return {
      count: rows.length,
      total: rows.reduce((s, r) => s + Number(r.phantom_amount || 0), 0),
      pending: rows.filter((r) => r.status === 'pending_review').length,
    };
  }, [data]);

  const decide = useMutation({
    mutationFn: async (payload: { id: string; mode: ActionMode; amount: number; reason: string }) => {
      const fn = payload.mode === 'release' ? 'release_historical_drift' : 'writedown_historical_drift';
      const { data, error } = await supabase.rpc(fn, {
        p_review_id: payload.id,
        p_amount: payload.amount,
        p_reason: payload.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.mode === 'release' ? 'Drift released' : 'Drift written down');
      setActiveRow(null);
      setAmount('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['historical-drift-review'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Action failed'),
  });

  const openDialog = (row: ReviewRow, m: ActionMode) => {
    setActiveRow(row);
    setMode(m);
    setAmount(String(m === 'release' ? row.phantom_amount : row.cached_withdrawable));
    setReason('');
  };

  const submit = () => {
    if (!activeRow) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error('Enter a positive amount');
      return;
    }
    if (reason.trim().length < 10) {
      toast.error('Reason must be at least 10 characters');
      return;
    }
    decide.mutate({ id: activeRow.id, mode, amount: amt, reason: reason.trim() });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            Historical Drift Review
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Cached withdrawable balances frozen by the 2026-04-29 fresh-start anchor. Each agent requires an
            explicit CFO decision: release the cache as withdrawable, or write it down to match production net.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={cn('w-4 h-4 mr-2', isRefetching && 'animate-spin')} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Anchored agents</div>
            <div className="text-2xl font-semibold">{summary.count}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Total phantom (UGX)</div>
            <div className="text-2xl font-semibold">{formatUGX(summary.total)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Pending review</div>
            <div className="text-2xl font-semibold">{summary.pending}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['pending_review', 'approved_release', 'approved_writedown', 'escalated', 'all'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s)}
            >
              {s.replace('_', ' ')}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">No rows for this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3 text-right">Cached</th>
                  <th className="py-2 pr-3 text-right">Pre-anchor net</th>
                  <th className="py-2 pr-3 text-right">Phantom</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data!.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.profile?.full_name ?? 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground">{r.profile?.phone ?? r.user_id.slice(0, 8)}</div>
                    </td>
                    <td className="py-2 pr-3 text-right">{formatUGX(Number(r.cached_withdrawable))}</td>
                    <td className="py-2 pr-3 text-right">{formatUGX(Number(r.pre_anchor_ledger_net))}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{formatUGX(Number(r.phantom_amount))}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className={STATUS_COLOR[r.status]}>
                        {r.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-right space-x-2">
                      {r.status === 'pending_review' ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => openDialog(r, 'release')}>
                            <ArrowUpFromLine className="w-3.5 h-3.5 mr-1" /> Release
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openDialog(r, 'writedown')}>
                            <ArrowDownToLine className="w-3.5 h-3.5 mr-1" /> Write-down
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.cfo_decision ?? '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!activeRow} onOpenChange={(o) => !o && setActiveRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === 'release' ? 'Release historical drift' : 'Write down historical drift'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'release'
                ? 'Posts a balanced admin_correction crediting the agent so the cached balance becomes withdrawable.'
                : 'Posts a balanced admin_correction debiting the agent so the cached balance is removed from books.'}
            </DialogDescription>
          </DialogHeader>
          {activeRow && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md bg-muted p-3 space-y-1">
                <div><span className="text-muted-foreground">Agent:</span> {activeRow.profile?.full_name ?? activeRow.user_id}</div>
                <div><span className="text-muted-foreground">Cached:</span> {formatUGX(Number(activeRow.cached_withdrawable))}</div>
                <div><span className="text-muted-foreground">Pre-anchor net:</span> {formatUGX(Number(activeRow.pre_anchor_ledger_net))}</div>
                <div><span className="text-muted-foreground">Phantom amount:</span> {formatUGX(Number(activeRow.phantom_amount))}</div>
              </div>
              <div>
                <label className="text-xs font-medium">Amount (UGX)</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={1}
                  max={mode === 'release' ? Number(activeRow.phantom_amount) : Number(activeRow.cached_withdrawable)}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Reason (min 10 characters)</label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActiveRow(null)}>Cancel</Button>
            <Button onClick={submit} disabled={decide.isPending}>
              {decide.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}