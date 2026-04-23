import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, AlertTriangle, ShieldCheck, Eye } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type DriftStatus = 'open' | 'investigating' | 'resolved' | 'false_positive';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface DriftRow {
  id: string;
  user_id: string;
  wallet_balance: number;
  ledger_net: number;
  drift_amount: number;
  drift_type: 'positive_phantom' | 'negative_overdebit';
  severity: Severity;
  status: DriftStatus;
  first_detected_at: string;
  last_detected_at: string;
  resolution_notes: string | null;
  profile?: { full_name: string | null; phone: string | null } | null;
}

const SEV_COLOR: Record<Severity, string> = {
  critical: 'bg-red-500/15 text-red-700 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  low: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
};

const STATUS_COLOR: Record<DriftStatus, string> = {
  open: 'bg-red-500/15 text-red-700 border-red-500/30',
  investigating: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  false_positive: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
};

export function PhantomDriftPanel() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<DriftStatus | 'all'>('open');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['phantom-drift', statusFilter, severityFilter],
    queryFn: async () => {
      let q = supabase
        .from('phantom_wallet_drift')
        .select('*')
        .order('severity', { ascending: false })
        .order('last_detected_at', { ascending: false })
        .limit(500);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (severityFilter !== 'all') q = q.eq('severity', severityFilter);
      const { data, error } = await q;
      if (error) throw error;

      const userIds = [...new Set((data ?? []).map((r) => r.user_id))];
      if (userIds.length === 0) return [] as DriftRow[];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((r) => ({ ...r, profile: pmap.get(r.user_id) ?? null })) as DriftRow[];
    },
    refetchInterval: 60_000,
  });

  const runDetection = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('detect_phantom_wallet_drift');
      if (error) throw error;
      return data as { new_drift_rows: number; updated_drift_rows: number; auto_resolved: number; total_drift_ugx: number };
    },
    onSuccess: (res) => {
      toast.success(
        `Scan complete: ${res.new_drift_rows} new, ${res.updated_drift_rows} updated, ${res.auto_resolved} auto-resolved`,
      );
      qc.invalidateQueries({ queryKey: ['phantom-drift'] });
    },
    onError: (e: Error) => toast.error(`Detection failed: ${e.message}`),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DriftStatus }) => {
      const patch: Partial<DriftRow> & { resolved_at?: string; resolved_by?: string } = { status };
      if (status === 'resolved' || status === 'false_positive') {
        patch.resolved_at = new Date().toISOString();
        const { data: u } = await supabase.auth.getUser();
        if (u.user) patch.resolved_by = u.user.id;
      }
      const { error } = await supabase.from('phantom_wallet_drift').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Status updated');
      qc.invalidateQueries({ queryKey: ['phantom-drift'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const summary = useMemo(() => {
    const rows = data ?? [];
    const open = rows.filter((r) => r.status === 'open');
    const totalGap = open.reduce((s, r) => s + Math.abs(Number(r.drift_amount)), 0);
    const critical = open.filter((r) => r.severity === 'critical').length;
    const positive = open.filter((r) => r.drift_type === 'positive_phantom').length;
    const negative = open.filter((r) => r.drift_type === 'negative_overdebit').length;
    return { count: open.length, totalGap, critical, positive, negative };
  }, [data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Phantom Wallet Drift Monitor
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Wallets where balance ≠ ledger-derived balance. Auto-scanned every 15 minutes.
              </p>
            </div>
            <Button onClick={() => runDetection.mutate()} disabled={runDetection.isPending} size="sm">
              {runDetection.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Run Scan Now
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryStat label="Open Issues" value={String(summary.count)} tone={summary.count > 0 ? 'warn' : 'ok'} />
            <SummaryStat label="Total Drift" value={formatUGX(summary.totalGap)} tone={summary.totalGap > 0 ? 'warn' : 'ok'} />
            <SummaryStat label="Critical" value={String(summary.critical)} tone={summary.critical > 0 ? 'danger' : 'ok'} />
            <SummaryStat label="Positive Phantom" value={String(summary.positive)} tone="warn" />
            <SummaryStat label="Negative Over-debit" value={String(summary.negative)} tone="warn" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DriftStatus | 'all')}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="investigating">Investigating</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="false_positive">False Positive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as Severity | 'all')}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (data ?? []).length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
              No drift detected with the current filters.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">User</th>
                      <th className="text-right p-2">Wallet</th>
                      <th className="text-right p-2">Ledger Net</th>
                      <th className="text-right p-2">Drift</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Severity</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Last Detected</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data ?? []).map((r) => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                        <td className="p-2">
                          <div className="font-medium">{r.profile?.full_name ?? '—'}</div>
                          <div className="text-muted-foreground">{r.profile?.phone ?? r.user_id.slice(0, 8)}</div>
                        </td>
                        <td className="p-2 text-right tabular-nums">{formatUGX(Number(r.wallet_balance))}</td>
                        <td className="p-2 text-right tabular-nums">{formatUGX(Number(r.ledger_net))}</td>
                        <td className={cn('p-2 text-right tabular-nums font-semibold', Number(r.drift_amount) > 0 ? 'text-orange-600' : 'text-blue-600')}>
                          {Number(r.drift_amount) > 0 ? '+' : ''}{formatUGX(Number(r.drift_amount))}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">
                            {r.drift_type === 'positive_phantom' ? 'Phantom +' : 'Over-debit −'}
                          </Badge>
                        </td>
                        <td className="p-2"><Badge className={cn('text-[10px] border', SEV_COLOR[r.severity])} variant="outline">{r.severity}</Badge></td>
                        <td className="p-2"><Badge className={cn('text-[10px] border', STATUS_COLOR[r.status])} variant="outline">{r.status}</Badge></td>
                        <td className="p-2 text-muted-foreground">{new Date(r.last_detected_at).toLocaleString()}</td>
                        <td className="p-2">
                          {(r.status === 'open' || r.status === 'investigating') && (
                            <div className="flex gap-1 flex-wrap">
                              {r.status === 'open' && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => updateStatus.mutate({ id: r.id, status: 'investigating' })}>
                                  <Eye className="h-3 w-3 mr-1" />Investigate
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => updateStatus.mutate({ id: r.id, status: 'resolved' })}>
                                Resolve
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-muted-foreground" onClick={() => updateStatus.mutate({ id: r.id, status: 'false_positive' })}>
                                False+
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'danger' }) {
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

export default PhantomDriftPanel;
