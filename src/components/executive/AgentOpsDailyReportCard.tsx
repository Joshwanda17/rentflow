import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, PieChart, Pie, Cell, BarChart,
} from 'recharts';
import {
  Activity, Banknote, Users, Wallet, HandCoins, TrendingUp, RefreshCw, Clock,
} from 'lucide-react';

/** Always-UGX formatter (mirrors the daily email report — platform base currency). */
function fmtUGX(n: number): string {
  return `UGX ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
}
function fmtCompact(n: number): string {
  const v = Number(n) || 0;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}

// Calendar day (YYYY-MM-DD) + UTC ISO bounds for "today" in East Africa Time (UTC+3).
function eatTodayBounds() {
  const eat = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const y = eat.getUTCFullYear();
  const m = eat.getUTCMonth();
  const d = eat.getUTCDate();
  const startMs = Date.UTC(y, m, d) - 3 * 60 * 60 * 1000;
  const endMs = startMs + 24 * 60 * 60 * 1000;
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { startISO: new Date(startMs).toISOString(), endISO: new Date(endMs).toISOString(), dateStr };
}
function eatHour(iso: string): number {
  return new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000).getUTCHours();
}

interface Report {
  collectionsCount: number;
  collectionsTotal: number;
  depositsCount: number;
  depositsTotal: number;
  advancesCount: number;
  advancesPending: number;
  advancesApproved: number;
  advancesTotal: number;
  uniqueAgents: number;
  hourly: { hour: string; collections: number; volume: number }[];
  mix: { name: string; value: number }[];
  topAgents: { name: string; total: number; count: number }[];
  perAgent: { name: string; phone: string; collections: number; collected: number; deposits: number; deposited: number }[];
}

const CHART = {
  collections: 'hsl(var(--chart-1))',
  volume: 'hsl(var(--chart-2))',
  advances: 'hsl(var(--chart-4))',
};
const MIX_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-4))'];

async function fetchReport(): Promise<Report & { dateStr: string }> {
  const { startISO, endISO, dateStr } = eatTodayBounds();

  const [collectionsRes, advancesRes, depositsRes] = await Promise.all([
    supabase.from('agent_collections').select('id, agent_id, amount, created_at').gte('created_at', startISO).lt('created_at', endISO),
    supabase.from('agent_advance_requests').select('id, agent_id, principal, status, created_at').gte('created_at', startISO).lt('created_at', endISO),
    supabase.from('wallet_deposits').select('id, agent_id, amount, created_at').gte('created_at', startISO).lt('created_at', endISO),
  ]);

  const collections = collectionsRes.data ?? [];
  const advances = advancesRes.data ?? [];
  const deposits = depositsRes.data ?? [];

  const ids = Array.from(new Set([
    ...collections.map((c: any) => c.agent_id),
    ...advances.map((a: any) => a.agent_id),
    ...deposits.map((d: any) => d.agent_id),
  ].filter(Boolean) as string[]));

  const profilesMap: Record<string, any> = {};
  if (ids.length) {
    const { data } = await supabase.from('profiles').select('id, full_name, phone_number').in('id', ids);
    (data ?? []).forEach((p: any) => (profilesMap[p.id] = p));
  }
  const nameOf = (id: string) => (profilesMap[id]?.full_name || '').trim() || 'Unknown agent';

  const collectionsTotal = collections.reduce((s: number, c: any) => s + Number(c.amount ?? 0), 0);
  const depositsTotal = deposits.reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0);
  const advancesTotal = advances.reduce((s: number, a: any) => s + Number(a.principal ?? 0), 0);
  const advancesPending = advances.filter((a: any) => (a.status ?? 'pending') === 'pending').length;
  const advancesApproved = advances.filter((a: any) => String(a.status ?? '').includes('approved')).length;
  const uniqueAgents = new Set([...collections, ...deposits].map((r: any) => r.agent_id).filter(Boolean)).size;

  const hourlyCount = new Array(24).fill(0);
  const hourlyVol = new Array(24).fill(0);
  for (const c of collections as any[]) {
    const h = eatHour(c.created_at);
    hourlyCount[h] += 1;
    hourlyVol[h] += Number(c.amount ?? 0);
  }
  const hourly = hourlyCount.map((count, h) => ({ hour: `${h}:00`, collections: count, volume: hourlyVol[h] }));

  const byAgent: Record<string, { collected: number; collections: number; deposited: number; deposits: number }> = {};
  const bump = (id: string) => (byAgent[id] ??= { collected: 0, collections: 0, deposited: 0, deposits: 0 });
  for (const c of collections as any[]) {
    if (!c.agent_id) continue;
    const a = bump(c.agent_id); a.collected += Number(c.amount ?? 0); a.collections += 1;
  }
  for (const d of deposits as any[]) {
    if (!d.agent_id) continue;
    const a = bump(d.agent_id); a.deposited += Number(d.amount ?? 0); a.deposits += 1;
  }

  const topAgents = Object.entries(byAgent)
    .sort(([, a], [, b]) => b.collected - a.collected)
    .slice(0, 8)
    .map(([id, v]) => ({ name: nameOf(id).slice(0, 18), total: Math.round(v.collected), count: v.collections }));

  const perAgent = Object.entries(byAgent)
    .sort(([, a], [, b]) => (b.collected + b.deposited) - (a.collected + a.deposited))
    .map(([id, v]) => ({
      name: nameOf(id),
      phone: profilesMap[id]?.phone_number || '—',
      collections: v.collections,
      collected: Math.round(v.collected),
      deposits: v.deposits,
      deposited: Math.round(v.deposited),
    }));

  return {
    dateStr,
    collectionsCount: collections.length,
    collectionsTotal,
    depositsCount: deposits.length,
    depositsTotal,
    advancesCount: advances.length,
    advancesPending,
    advancesApproved,
    advancesTotal,
    uniqueAgents,
    hourly,
    mix: [
      { name: 'Rent collections', value: collections.length },
      { name: 'Wallet deposits', value: deposits.length },
      { name: 'Advance requests', value: advances.length },
    ],
    topAgents,
    perAgent,
  };
}

function Kpi({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background p-3">
      <div className={`p-2 rounded-lg shrink-0 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-base sm:text-lg font-bold truncate">{value}</p>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, ugxKeys = [] as string[] }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label != null && <p className="font-medium text-popover-foreground mb-1">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full mr-1.5 align-middle" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-popover-foreground">
            {ugxKeys.includes(p.dataKey) ? fmtUGX(p.value) : Number(p.value).toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}

export function AgentOpsDailyReportCard() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['agent-ops-daily-report-card'],
    queryFn: fetchReport,
    staleTime: 300000,
  });

  const prettyDate = useMemo(() => {
    if (!data?.dateStr) return '';
    return new Date(`${data.dateStr}T00:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  }, [data?.dateStr]);

  const avgPerAgent = data && data.uniqueAgents ? data.collectionsTotal / data.uniqueAgents : 0;
  const hasActivity = !!data && data.perAgent.length > 0;

  return (
    <div className="w-full rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 bg-primary text-primary-foreground px-4 sm:px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 shrink-0" />
            <h3 className="text-base sm:text-lg font-semibold truncate">Agent Ops — Daily Report</h3>
          </div>
          <p className="text-xs sm:text-sm opacity-90 mt-1 truncate">
            {prettyDate ? `${prettyDate} · East Africa Time` : 'Today · East Africa Time'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary-foreground/15 hover:bg-primary-foreground/25 px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              <Kpi label="Active agents" value={String(data?.uniqueAgents ?? 0)} icon={Users} color="bg-primary/10 text-primary" />
              <Kpi label="Collections" value={String(data?.collectionsCount ?? 0)} icon={Banknote} color="bg-primary/10 text-primary" />
              <Kpi label="Collected" value={fmtUGX(data?.collectionsTotal ?? 0)} icon={TrendingUp} color="bg-success/10 text-success" />
              <Kpi label="Avg / agent" value={fmtUGX(avgPerAgent)} icon={Activity} color="bg-accent text-accent-foreground" />
              <Kpi label="Wallet deposits" value={String(data?.depositsCount ?? 0)} icon={Wallet} color="bg-primary/10 text-primary" />
              <Kpi label="Deposited" value={fmtUGX(data?.depositsTotal ?? 0)} icon={TrendingUp} color="bg-success/10 text-success" />
              <Kpi label="Advances pending" value={String(data?.advancesPending ?? 0)} icon={Clock} color="bg-warning/10 text-warning" />
              <Kpi label="Advances approved" value={String(data?.advancesApproved ?? 0)} icon={HandCoins} color="bg-primary/10 text-primary" />
            </div>

            {/* Hourly collections */}
            <div className="rounded-xl border border-border/60 bg-background p-3 sm:p-4">
              <h4 className="text-sm font-semibold mb-3">Collections by hour (EAT)</h4>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={data?.hourly || []} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" className="text-[10px]" interval={1} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis yAxisId="left" className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={fmtCompact} />
                  <Tooltip content={<ChartTooltip ugxKeys={['volume']} />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="collections" name="Collections" fill={CHART.collections} radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="volume" name="Volume (UGX)" stroke={CHART.volume} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Activity mix + Top agents */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-xl border border-border/60 bg-background p-3 sm:p-4">
                <h4 className="text-sm font-semibold mb-3">Activity mix</h4>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={data?.mix || []}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {(data?.mix || []).map((_, i) => (
                        <Cell key={i} fill={MIX_COLORS[i % MIX_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-border/60 bg-background p-3 sm:p-4">
                <h4 className="text-sm font-semibold mb-3">Top agents by volume</h4>
                {data?.topAgents.length ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={data.topAgents} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                      <XAxis type="number" className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={fmtCompact} />
                      <YAxis type="category" dataKey="name" width={100} className="text-[10px]" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip content={<ChartTooltip ugxKeys={['total']} />} />
                      <Bar dataKey="total" name="Collected (UGX)" fill={CHART.collections} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                    No agent volume recorded yet today.
                  </div>
                )}
              </div>
            </div>

            {/* Per-agent breakdown */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Per agent breakdown</h4>
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary text-primary-foreground text-left">
                      <th className="px-3 py-2 font-medium">Agent</th>
                      <th className="px-3 py-2 font-medium">Phone</th>
                      <th className="px-3 py-2 font-medium text-right">Collections</th>
                      <th className="px-3 py-2 font-medium text-right">Collected</th>
                      <th className="px-3 py-2 font-medium text-right">Deposits</th>
                      <th className="px-3 py-2 font-medium text-right">Deposited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hasActivity ? (
                      data!.perAgent.map((a, i) => (
                        <tr key={i} className={i % 2 ? 'bg-muted/40' : 'bg-background'}>
                          <td className="px-3 py-2 whitespace-nowrap">{a.name}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{a.phone}</td>
                          <td className="px-3 py-2 text-right">{a.collections}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtUGX(a.collected)}</td>
                          <td className="px-3 py-2 text-right">{a.deposits}</td>
                          <td className="px-3 py-2 text-right">{fmtUGX(a.deposited)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                          No agent field activity recorded for today yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Live view of the same figures emailed daily at 18:00 EAT — rent collections, wallet deposits and
              credit advance requests captured by agents in the field today (Africa/Kampala).
            </p>
          </>
        )}
      </div>
    </div>
  );
}