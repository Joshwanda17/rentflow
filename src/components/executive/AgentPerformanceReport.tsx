import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, FileBarChart } from 'lucide-react';
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { generateAgentPerformancePdf, AgentPerfRow, AgentPerfTotals } from '@/lib/agentPerformanceReportPdf';

type RangePreset = 'this-week' | 'last-week' | 'this-month' | 'last-7';

const getRange = (preset: RangePreset): { start: Date; end: Date } => {
  const now = new Date();
  switch (preset) {
    case 'this-week': return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'last-week': {
      const lw = subWeeks(now, 1);
      return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) };
    }
    case 'this-month': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last-7':
    default: {
      const start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
  }
};

const statusFor = (pctPaid: number): AgentPerfRow['status'] => {
  if (pctPaid < 25) return 'critical';
  if (pctPaid < 50) return 'low';
  if (pctPaid < 75) return 'moderate';
  return 'strong';
};

const STATUS_BADGE: Record<AgentPerfRow['status'], { variant: any; label: string; cls: string }> = {
  critical: { variant: 'destructive', label: 'Critical', cls: 'bg-red-500/10 text-red-600 border-red-500/30' },
  low:      { variant: 'warning',     label: 'Low',      cls: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
  moderate: { variant: 'warning',     label: 'Moderate', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  strong:   { variant: 'success',     label: 'Strong',   cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
};

const fmt = (n: number) => Math.round(n).toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function AgentPerformanceReport() {
  const [preset, setPreset] = useState<RangePreset>('last-7');
  const range = useMemo(() => getRange(preset), [preset]);
  const startISO = range.start.toISOString();
  const endISO = range.end.toISOString();
  const periodLabel = `${format(range.start, 'MMM d')} – ${format(range.end, 'MMM d, yyyy')}`;

  const { data, isLoading } = useQuery({
    queryKey: ['agent-perf-report', startISO, endISO],
    queryFn: async () => {
      // Pull collections in window
      const { data: collections } = await supabase
        .from('agent_collections')
        .select('agent_id, amount, tenant_id, created_at')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      // Pull earnings in window (for interest)
      const { data: earnings } = await supabase
        .from('agent_earnings')
        .select('agent_id, amount, earning_type, created_at')
        .gte('created_at', startISO)
        .lte('created_at', endISO);

      // Pull rent_requests for tenant counts (assigned tenants) - paginated to bypass 1000-row cap
      const rentReqs: { agent_id: string | null; tenant_id: string | null }[] = [];
      {
        const PAGE = 1000;
        let from = 0;
        // Cap at 20k rows defensively
        for (let p = 0; p < 20; p++) {
          const { data, error } = await supabase
            .from('rent_requests')
            .select('agent_id, tenant_id')
            .not('agent_id', 'is', null)
            .range(from, from + PAGE - 1);
          if (error || !data || data.length === 0) break;
          rentReqs.push(...(data as any));
          if (data.length < PAGE) break;
          from += PAGE;
        }
      }

      const agentIds = Array.from(new Set([
        ...(collections || []).map(c => c.agent_id),
        ...(earnings || []).map(e => e.agent_id),
        ...(rentReqs || []).map(r => r.agent_id as string),
      ].filter(Boolean)));

      let profilesMap: Record<string, string> = {};
      if (agentIds.length) {
        const BATCH = 50;
        for (let i = 0; i < agentIds.length; i += BATCH) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', agentIds.slice(i, i + BATCH));
          (profs || []).forEach(p => { profilesMap[p.id] = p.full_name || p.id.slice(0, 8); });
        }
      }

      // Aggregate per agent
      type Agg = {
        collected: number; payments: number;
        interest: number; commissionEarnings: number;
        tenantsPaid: Set<string>; tenantsTotal: Set<string>;
      };
      const agg: Record<string, Agg> = {};
      const ensure = (id: string): Agg => agg[id] ??= {
        collected: 0, payments: 0, interest: 0, commissionEarnings: 0,
        tenantsPaid: new Set(), tenantsTotal: new Set(),
      };

      (collections || []).forEach(c => {
        const a = ensure(c.agent_id);
        a.collected += Number(c.amount || 0);
        a.payments += 1;
      });
      (earnings || []).forEach(e => {
        const a = ensure(e.agent_id);
        const type = String(e.earning_type || '').toLowerCase();
        if (type.includes('interest')) a.interest += Number(e.amount || 0);
        else if (type.includes('commission')) a.commissionEarnings += Number(e.amount || 0);
      });
      rentReqs.forEach(r => {
        if (!r.agent_id || !r.tenant_id) return;
        ensure(r.agent_id).tenantsTotal.add(r.tenant_id);
      });
      // Mark tenants paid from collections in window (regardless of rent_request linkage)
      (collections || []).forEach(c => {
        if (!c.tenant_id) return;
        const a = ensure(c.agent_id);
        a.tenantsPaid.add(c.tenant_id);
        // Ensure paid tenants always count toward total (in case rent_request link is missing)
        a.tenantsTotal.add(c.tenant_id);
      });

      const rows: AgentPerfRow[] = Object.entries(agg).map(([id, a]) => {
        // Use ledger commission if present, else 5% of collected as display fallback
        const commission = a.commissionEarnings > 0 ? a.commissionEarnings : a.collected * 0.10;
        const wallet_total = commission + a.interest;
        const tenantsTotal = a.tenantsTotal.size || a.tenantsPaid.size;
        const tenantsPaid = a.tenantsPaid.size;
        const pctPaid = tenantsTotal ? (tenantsPaid / tenantsTotal) * 100 : 0;
        const rate = a.collected ? (wallet_total / a.collected) * 100 : 0;
        return {
          rank: 0,
          agent_name: profilesMap[id] || id.slice(0, 8),
          tenants_paid: tenantsPaid,
          tenants_total: tenantsTotal,
          pct_paid: pctPaid,
          collected: a.collected,
          payments: a.payments,
          commission,
          interest: a.interest,
          wallet_total,
          rate,
          status: statusFor(pctPaid),
        };
      })
      .filter(r => r.tenants_total > 0)
      .sort((x, y) => y.collected - x.collected)
      .map((r, i) => ({ ...r, rank: i + 1 }));

      const totals: AgentPerfTotals = rows.reduce((t, r) => ({
        collected: t.collected + r.collected,
        payments: t.payments + r.payments,
        commission: t.commission + r.commission,
        interest: t.interest + r.interest,
        wallet_total: t.wallet_total + r.wallet_total,
        tenants_paid: t.tenants_paid + r.tenants_paid,
        tenants_total: t.tenants_total + r.tenants_total,
      }), { collected: 0, payments: 0, commission: 0, interest: 0, wallet_total: 0, tenants_paid: 0, tenants_total: 0 });

      return { rows, totals };
    },
    staleTime: 60_000,
  });

  const rows = data?.rows || [];
  const totals = data?.totals || { collected: 0, payments: 0, commission: 0, interest: 0, wallet_total: 0, tenants_paid: 0, tenants_total: 0 };

  const handleDownloadPdf = async () => {
    if (!rows.length) { toast.error('No data to export'); return; }
    try {
      const blob = await generateAgentPerformancePdf({
        rows, totals, periodLabel, startDate: range.start, endDate: range.end,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent_performance_${format(range.start, 'yyyy-MM-dd')}_${format(range.end, 'yyyy-MM-dd')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (e: any) {
      toast.error('Failed to generate PDF', { description: e?.message });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-600 text-white shadow-sm">
            <FileBarChart className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold leading-tight">Agent Performance & Wallet Earnings</h2>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="last-7">Last 7 Days</SelectItem>
              <SelectItem value="this-week">This Week</SelectItem>
              <SelectItem value="last-week">Last Week</SelectItem>
              <SelectItem value="this-month">This Month</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleDownloadPdf} className="h-9 gap-2" disabled={isLoading || !rows.length}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download PDF</span>
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Total Collected</div>
          <div className="text-lg font-bold mt-1">UGX {fmt(totals.collected)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Commission</div>
          <div className="text-lg font-bold mt-1 text-emerald-600">UGX {fmt(totals.commission)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Interest</div>
          <div className="text-lg font-bold mt-1 text-blue-600">UGX {fmt(totals.interest)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Total Wallet</div>
          <div className="text-lg font-bold mt-1 text-primary">UGX {fmt(totals.wallet_total)}</div>
        </div>
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blue-600 text-white sticky top-0">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold w-10">#</th>
                <th className="px-3 py-2.5 text-left font-semibold">Agent</th>
                <th className="px-3 py-2.5 text-center font-semibold">Tenants Paid</th>
                <th className="px-3 py-2.5 text-right font-semibold">% Paid</th>
                <th className="px-3 py-2.5 text-right font-semibold">Collected</th>
                <th className="px-3 py-2.5 text-right font-semibold">Payments</th>
                <th className="px-3 py-2.5 text-right font-semibold">10% Comm.</th>
                <th className="px-3 py-2.5 text-right font-semibold">0.5% Int.</th>
                <th className="px-3 py-2.5 text-right font-semibold">Wallet</th>
                <th className="px-3 py-2.5 text-right font-semibold">% Rate</th>
                <th className="px-3 py-2.5 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-12 text-center text-muted-foreground">No agent activity in this period</td></tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className={cn('border-b border-border hover:bg-muted/30 transition-colors', i % 2 === 0 && 'bg-muted/20')}>
                    <td className="px-3 py-2.5 font-medium">{r.rank}</td>
                    <td className="px-3 py-2.5 font-medium">{r.agent_name}</td>
                    <td className="px-3 py-2.5 text-center">{r.tenants_paid}/{r.tenants_total}</td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(r.pct_paid)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(r.collected)}</td>
                    <td className="px-3 py-2.5 text-right">{r.payments}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-600">{fmt(r.commission)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-blue-600">{fmt(r.interest)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmt(r.wallet_total)}</td>
                    <td className="px-3 py-2.5 text-right">{fmtPct(r.rate)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border', STATUS_BADGE[r.status].cls)}>
                        {STATUS_BADGE[r.status].label}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && rows.length > 0 && (
              <tfoot>
                <tr className="bg-blue-50 dark:bg-blue-950/30 font-bold border-t-2 border-blue-600">
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-blue-700 dark:text-blue-400">TOTALS</td>
                  <td className="px-3 py-3 text-center">{totals.tenants_paid}/{totals.tenants_total}</td>
                  <td className="px-3 py-3 text-right">{totals.tenants_total ? fmtPct((totals.tenants_paid / totals.tenants_total) * 100) : '0.0%'}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmt(totals.collected)}</td>
                  <td className="px-3 py-3 text-right">{totals.payments}</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-700">{fmt(totals.commission)}</td>
                  <td className="px-3 py-3 text-right font-mono text-blue-700">{fmt(totals.interest)}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmt(totals.wallet_total)}</td>
                  <td className="px-3 py-3 text-right">{totals.collected ? fmtPct((totals.wallet_total / totals.collected) * 100) : '0.0%'}</td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground text-sm">No agent activity in this period</div>
        ) : (
          <>
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-xs text-muted-foreground">#{r.rank}</div>
                    <div className="font-semibold">{r.agent_name}</div>
                  </div>
                  <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-semibold border', STATUS_BADGE[r.status].cls)}>
                    {STATUS_BADGE[r.status].label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Tenants</div><div className="font-semibold">{r.tenants_paid}/{r.tenants_total}</div></div>
                  <div><div className="text-muted-foreground">Collected</div><div className="font-semibold">{fmt(r.collected)}</div></div>
                  <div><div className="text-muted-foreground">Payments</div><div className="font-semibold">{r.payments}</div></div>
                  <div><div className="text-muted-foreground">Commission</div><div className="font-semibold text-emerald-600">{fmt(r.commission)}</div></div>
                  <div><div className="text-muted-foreground">Interest</div><div className="font-semibold text-blue-600">{fmt(r.interest)}</div></div>
                  <div><div className="text-muted-foreground">Wallet</div><div className="font-bold">{fmt(r.wallet_total)}</div></div>
                </div>
              </div>
            ))}
            <div className="rounded-xl border-2 border-blue-600 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2">
              <div className="font-bold text-blue-700 dark:text-blue-400">TOTALS</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-muted-foreground">Tenants</div><div className="font-bold">{totals.tenants_paid}/{totals.tenants_total}</div></div>
                <div><div className="text-muted-foreground">Collected</div><div className="font-bold">{fmt(totals.collected)}</div></div>
                <div><div className="text-muted-foreground">Wallet</div><div className="font-bold">{fmt(totals.wallet_total)}</div></div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
