import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, RefreshCw, ShieldCheck, Eye, Settings2, BellRing } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type AlertStatus = 'open' | 'investigating' | 'resolved' | 'false_positive';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface AlertRow {
  id: string;
  user_id: string;
  withdrawable_cached: number;
  expected_withdrawable: number;
  baseline_withdrawable: number;
  baseline_ledger_net: number;
  ledger_net_now: number;
  deviation_amount: number;
  deviation_direction: 'overstated' | 'understated';
  severity: Severity;
  status: AlertStatus;
  first_detected_at: string;
  last_detected_at: string;
  resolution_notes: string | null;
  profile?: { full_name: string | null; phone: string | null } | null;
}

interface ConfigRow {
  id: string;
  low_threshold_ugx: number;
  medium_threshold_ugx: number;
  high_threshold_ugx: number;
  critical_threshold_ugx: number;
  enabled: boolean;
  updated_at: string;
}

const SEV_COLOR: Record<Severity, string> = {
  critical: 'bg-red-500/15 text-red-700 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-700 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  low: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
};

const STATUS_COLOR: Record<AlertStatus, string> = {
  open: 'bg-red-500/15 text-red-700 border-red-500/30',
  investigating: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  false_positive: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
};

export function WithdrawableDriftAlertsPanel() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('open');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [configOpen, setConfigOpen] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['withdrawable-drift-alerts', statusFilter, severityFilter],
    queryFn: async () => {
      let q = supabase
        .from('wallet_withdrawable_drift_alerts')
        .select('*')
        .order('severity', { ascending: false })
        .order('last_detected_at', { ascending: false })
        .limit(500);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (severityFilter !== 'all') q = q.eq('severity', severityFilter);
      const { data, error } = await q;
      if (error) throw error;

      const userIds = [...new Set((data ?? []).map((r) => r.user_id))];
      if (userIds.length === 0) return [] as AlertRow[];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((r) => ({ ...r, profile: pmap.get(r.user_id) ?? null })) as AlertRow[];
    },
    refetchInterval: 60_000,
  });

  const { data: config } = useQuery({
    queryKey: ['wallet-drift-alert-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallet_drift_alert_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ConfigRow | null;
    },
  });

  const runDetection = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('detect_withdrawable_drift_alerts');
      if (error) throw error;
      return data as {
        new_alerts?: number;
        updated_alerts?: number;
        auto_resolved?: number;
        total_deviation_ugx?: number;
        skipped?: boolean;
      };
    },
    onSuccess: (res) => {
      if (res.skipped) {
        toast.info('Detector is currently disabled in config.');
      } else {
        toast.success(
          `Scan complete: ${res.new_alerts ?? 0} new, ${res.updated_alerts ?? 0} updated, ${res.auto_resolved ?? 0} auto-resolved`,
        );
      }
      qc.invalidateQueries({ queryKey: ['withdrawable-drift-alerts'] });
    },
    onError: (e: Error) => toast.error(`Detection failed: ${e.message}`),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AlertStatus }) => {
      const patch: Record<string, unknown> = { status };
      if (status === 'resolved' || status === 'false_positive') {
        patch.resolved_at = new Date().toISOString();
        const { data: u } = await supabase.auth.getUser();
        if (u.user) patch.resolved_by = u.user.id;
      }
      const { error } = await supabase
        .from('wallet_withdrawable_drift_alerts')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Alert updated');
      qc.invalidateQueries({ queryKey: ['withdrawable-drift-alerts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const summary = useMemo(() => {
    const rows = data ?? [];
    const open = rows.filter((r) => r.status === 'open');
    const totalDev = open.reduce((s, r) => s + Math.abs(Number(r.deviation_amount)), 0);
    const critical = open.filter((r) => r.severity === 'critical').length;
    const overstated = open.filter((r) => r.deviation_direction === 'overstated').length;
    const understated = open.filter((r) => r.deviation_direction === 'understated').length;
    return { count: open.length, totalDev, critical, overstated, understated };
  }, [data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BellRing className="h-5 w-5 text-orange-500" />
                Withdrawable Drift Alerts
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Flags wallets whose withdrawable bucket deviates from
                <span className="font-mono mx-1">baseline + ledger Δ</span>
                by more than the configured UGX threshold. Auto-scans every 15 minutes.
                {config && !config.enabled && (
                  <span className="ml-2 text-red-600 font-semibold">(detector disabled)</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Dialog open={configOpen} onOpenChange={setConfigOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings2 className="h-4 w-4 mr-2" />
                    Thresholds
                  </Button>
                </DialogTrigger>
                <ThresholdConfigDialog
                  config={config ?? null}
                  onClose={() => {
                    setConfigOpen(false);
                    qc.invalidateQueries({ queryKey: ['wallet-drift-alert-config'] });
                  }}
                />
              </Dialog>
              <Button onClick={() => runDetection.mutate()} disabled={runDetection.isPending} size="sm">
                {runDetection.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Run Scan Now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryStat label="Open Alerts" value={String(summary.count)} tone={summary.count > 0 ? 'warn' : 'ok'} />
            <SummaryStat label="Total Deviation" value={formatUGX(summary.totalDev)} tone={summary.totalDev > 0 ? 'warn' : 'ok'} />
            <SummaryStat label="Critical" value={String(summary.critical)} tone={summary.critical > 0 ? 'danger' : 'ok'} />
            <SummaryStat label="Overstated" value={String(summary.overstated)} tone="warn" />
            <SummaryStat label="Understated" value={String(summary.understated)} tone="warn" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AlertStatus | 'all')}>
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
              No withdrawable drift alerts with the current filters.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">User</th>
                      <th className="text-right p-2">Cached</th>
                      <th className="text-right p-2">Expected</th>
                      <th className="text-right p-2">Deviation</th>
                      <th className="text-left p-2">Direction</th>
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
                        <td className="p-2 text-right tabular-nums">{formatUGX(Number(r.withdrawable_cached))}</td>
                        <td className="p-2 text-right tabular-nums">{formatUGX(Number(r.expected_withdrawable))}</td>
                        <td className={cn('p-2 text-right tabular-nums font-semibold', Number(r.deviation_amount) > 0 ? 'text-orange-600' : 'text-blue-600')}>
                          {Number(r.deviation_amount) > 0 ? '+' : ''}{formatUGX(Number(r.deviation_amount))}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">
                            {r.deviation_direction === 'overstated' ? 'Overstated +' : 'Understated −'}
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
                                Mark resolved
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

function ThresholdConfigDialog({ config, onClose }: { config: ConfigRow | null; onClose: () => void }) {
  const [low, setLow] = useState<string>(String(config?.low_threshold_ugx ?? 50000));
  const [medium, setMedium] = useState<string>(String(config?.medium_threshold_ugx ?? 250000));
  const [high, setHigh] = useState<string>(String(config?.high_threshold_ugx ?? 1000000));
  const [critical, setCritical] = useState<string>(String(config?.critical_threshold_ugx ?? 10000000));
  const [enabled, setEnabled] = useState<boolean>(config?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!config) {
      toast.error('Config row not loaded');
      return;
    }
    const lo = Number(low), me = Number(medium), hi = Number(high), cr = Number(critical);
    if ([lo, me, hi, cr].some((n) => !Number.isFinite(n) || n < 0)) {
      toast.error('Thresholds must be positive numbers');
      return;
    }
    if (!(lo <= me && me <= hi && hi <= cr)) {
      toast.error('Thresholds must be ordered: low ≤ medium ≤ high ≤ critical');
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('wallet_drift_alert_config')
      .update({
        low_threshold_ugx: lo,
        medium_threshold_ugx: me,
        high_threshold_ugx: hi,
        critical_threshold_ugx: cr,
        enabled,
        updated_by: u.user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', config.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Thresholds updated');
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Drift Alert Thresholds (UGX)</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <div className="text-sm font-medium">Detector enabled</div>
            <div className="text-xs text-muted-foreground">When off, the cron stops raising new alerts.</div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <ThresholdField label="Low" value={low} onChange={setLow} />
        <ThresholdField label="Medium" value={medium} onChange={setMedium} />
        <ThresholdField label="High" value={high} onChange={setHigh} />
        <ThresholdField label="Critical" value={critical} onChange={setCritical} />
        <p className="text-[11px] text-muted-foreground">
          A wallet is alerted when its withdrawable bucket differs from
          <span className="font-mono mx-1">baseline + (ledger now − ledger baseline)</span>
          by at least the Low threshold. Severity escalates as the deviation crosses higher tiers.
        </p>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save thresholds
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ThresholdField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 items-center gap-3">
      <Label className="text-sm">{label}</Label>
      <Input className="col-span-2 tabular-nums" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))} />
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

export default WithdrawableDriftAlertsPanel;
