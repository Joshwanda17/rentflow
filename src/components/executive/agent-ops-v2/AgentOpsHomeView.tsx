import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, UserPlus, FileText, Banknote, Activity, TrendingUp, TrendingDown, Loader2, ChevronRight } from 'lucide-react';
import { BriefDrillDownModal, type DrillMetric } from './BriefDrillDownModal';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { format, subDays, subHours, startOfDay, eachDayOfInterval, eachHourOfInterval, isAfter } from 'date-fns';

export type DateRange = '24h' | '7d' | '1m';

export interface AgentOpsHomeViewProps {
  range: DateRange;
  onRangeChange: (r: DateRange) => void;
  onOpenSection: (key: string) => void;
}

const RANGE_OPTIONS: { key: DateRange; label: string }[] = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '1m', label: '1M' },
];

const COMMISSION_LEDGER_CATEGORIES = [
  'agent_commission_earned',
  'agent_commission',
  'agent_bonus',
  'agent_investment_commission',
  'proxy_investment_commission',
  'partner_commission',
];

const COMMISSION_CREDIT_DIRECTIONS = ['cash_in', 'credit'];

interface TimestampRow {
  created_at: string | null;
}

interface CommissionLedgerRow extends TimestampRow {
  transaction_date?: string | null;
  amount?: number | string | null;
}

function getRangeStart(range: DateRange): Date {
  switch (range) {
    case '24h':
      return subHours(new Date(), 24);
    case '7d':
      return subDays(new Date(), 7);
    case '1m':
      return subDays(new Date(), 30);
  }
}

function getPrevRangeStart(range: DateRange): Date {
  switch (range) {
    case '24h':
      return subHours(new Date(), 48);
    case '7d':
      return subDays(new Date(), 14);
    case '1m':
      return subDays(new Date(), 60);
  }
}

function bucketsForRange(range: DateRange): { date: Date; label: string }[] {
  const now = new Date();
  if (range === '24h') {
    const start = subHours(now, 23);
    return eachHourOfInterval({ start, end: now }).map((d) => ({
      date: d,
      label: format(d, 'HH:00'),
    }));
  }
  const days = range === '7d' ? 7 : 30;
  const start = subDays(startOfDay(now), days - 1);
  return eachDayOfInterval({ start, end: now }).map((d) => ({
    date: d,
    label: format(d, range === '7d' ? 'EEE' : 'd MMM'),
  }));
}

function bucketKey(d: Date, range: DateRange): string {
  if (range === '24h') return format(d, 'yyyy-MM-dd HH');
  return format(d, 'yyyy-MM-dd');
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

interface BriefCardProps {
  title: string;
  value: string | number;
  changePct: number;
  series: number[];
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  onClick?: () => void;
  accent: 'primary' | 'emerald' | 'amber' | 'sky';
}

const ACCENT_MAP: Record<BriefCardProps['accent'], { bg: string; fg: string; stroke: string }> = {
  primary: { bg: 'bg-primary/10', fg: 'text-primary', stroke: 'hsl(var(--primary))' },
  emerald: { bg: 'bg-emerald-500/10', fg: 'text-emerald-600 dark:text-emerald-400', stroke: 'hsl(160 84% 39%)' },
  amber: { bg: 'bg-amber-500/10', fg: 'text-amber-600 dark:text-amber-400', stroke: 'hsl(38 92% 50%)' },
  sky: { bg: 'bg-sky-500/10', fg: 'text-sky-600 dark:text-sky-400', stroke: 'hsl(199 89% 48%)' },
};

function BriefCard({ title, value, changePct, series, icon: Icon, loading, onClick, accent }: BriefCardProps) {
  const colors = ACCENT_MAP[accent];
  const sparkData = series.map((v, i) => ({ x: i, y: v }));
  const isUp = changePct >= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group text-left rounded-2xl border border-border/50 bg-card p-3 sm:p-4',
        'shadow-sm hover:shadow-md hover:border-primary/30 transition-all active:scale-[0.98] touch-manipulation',
        'flex flex-col gap-2 min-h-[128px]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn('h-8 w-8 rounded-xl flex items-center justify-center shrink-0', colors.bg)}>
          <Icon className={cn('h-4 w-4', colors.fg)} />
        </div>
        <Badge
          variant="secondary"
          className={cn(
            'h-5 gap-0.5 px-1.5 text-[10px] font-semibold',
            isUp
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
              : 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
          )}
        >
          {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(changePct).toFixed(0)}%
        </Badge>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground line-clamp-1">{title}</p>
        <p className="text-xl sm:text-2xl font-bold text-foreground leading-tight tabular-nums">
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : value}
        </p>
      </div>
      <div className="h-9 -mx-1 -mb-1">
        {sparkData.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
              <defs>
                <linearGradient id={`spark-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.stroke} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={colors.stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="y"
                stroke={colors.stroke}
                strokeWidth={1.5}
                fill={`url(#spark-${title})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </button>
  );
}

export function AgentOpsHomeView({ range, onRangeChange, onOpenSection }: AgentOpsHomeViewProps) {
  const queryClient = useQueryClient();
  const rangeStart = useMemo(() => getRangeStart(range).toISOString(), [range]);
  const prevRangeStart = useMemo(() => getPrevRangeStart(range).toISOString(), [range]);
  const [activeDrill, setActiveDrill] = useState<DrillMetric | null>(null);

  // Realtime: invalidate when underlying tables change
  useEffect(() => {
    const channel = supabase
      .channel('agent-ops-home-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'general_ledger' }, () => {
        queryClient.invalidateQueries({ queryKey: ['agent-ops-home'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rent_requests' }, () => {
        queryClient.invalidateQueries({ queryKey: ['agent-ops-home'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['agent-ops-home'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ['agent-ops-home', range],
    queryFn: async () => {
      const [
        newAgentsCurr,
        newAgentsPrev,
        rentRequestsCurr,
        rentRequestsPrev,
        earningsCurr,
        earningsPrev,
      ] = await Promise.all([
        supabase.from('user_roles').select('user_id, created_at').eq('role', 'agent').gte('created_at', rangeStart),
        supabase
          .from('user_roles')
          .select('user_id', { count: 'exact', head: true })
          .eq('role', 'agent')
          .gte('created_at', prevRangeStart)
          .lt('created_at', rangeStart),
        supabase.from('rent_requests').select('id, agent_id, created_at').gte('created_at', rangeStart),
        supabase
          .from('rent_requests')
          .select('id, agent_id')
          .gte('created_at', prevRangeStart)
          .lt('created_at', rangeStart),
        // Source of truth: wallet-scoped general ledger commission credits.
        // `commission_accrual_ledger` and `agent_earnings` are legacy/accrual views and can lag real wallet earnings.
        supabase
          .from('general_ledger')
          .select('amount, created_at, transaction_date')
          .eq('ledger_scope', 'wallet')
          .in('category', COMMISSION_LEDGER_CATEGORIES)
          .in('direction', COMMISSION_CREDIT_DIRECTIONS)
          .gte('created_at', rangeStart),
        supabase
          .from('general_ledger')
          .select('amount')
          .eq('ledger_scope', 'wallet')
          .in('category', COMMISSION_LEDGER_CATEGORIES)
          .in('direction', COMMISSION_CREDIT_DIRECTIONS)
          .gte('created_at', prevRangeStart)
          .lt('created_at', rangeStart),
      ]);

      const currentCommissionRows = (earningsCurr.data ?? []) as CommissionLedgerRow[];
      const previousCommissionRows = (earningsPrev.data ?? []) as CommissionLedgerRow[];
      const newAgentsCurrCount = (newAgentsCurr.data ?? []).length;
      const earningsCurrTotal = currentCommissionRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const earningsPrevTotal = previousCommissionRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const rentCurrCount = (rentRequestsCurr.data ?? []).length;

      // Build buckets
      const buckets = bucketsForRange(range);
      const newAgentsByBucket = new Map(buckets.map((b) => [bucketKey(b.date, range), 0]));
      const rentByBucket = new Map(buckets.map((b) => [bucketKey(b.date, range), 0]));
      const earningsByBucket = new Map(buckets.map((b) => [bucketKey(b.date, range), 0]));
      const activeAgentsByBucket = new Map<string, Set<string>>(
        buckets.map((b) => [bucketKey(b.date, range), new Set<string>()]),
      );

      ((newAgentsCurr.data ?? []) as TimestampRow[]).forEach((r) => {
        const k = bucketKey(new Date(r.created_at), range);
        if (newAgentsByBucket.has(k)) newAgentsByBucket.set(k, (newAgentsByBucket.get(k) || 0) + 1);
      });
      ((rentRequestsCurr.data ?? []) as Array<TimestampRow & { agent_id?: string | null }>).forEach((r) => {
        const k = bucketKey(new Date(r.created_at!), range);
        if (rentByBucket.has(k)) rentByBucket.set(k, (rentByBucket.get(k) || 0) + 1);
        if (r.agent_id && activeAgentsByBucket.has(k)) activeAgentsByBucket.get(k)!.add(r.agent_id);
      });
      currentCommissionRows.forEach((r) => {
        const k = bucketKey(new Date(r.transaction_date || r.created_at), range);
        if (earningsByBucket.has(k))
          earningsByBucket.set(k, (earningsByBucket.get(k) || 0) + Number(r.amount ?? 0));
      });

      const trend = buckets.map((b) => {
        const k = bucketKey(b.date, range);
        return {
          label: b.label,
          agents: newAgentsByBucket.get(k) || 0,
          requests: rentByBucket.get(k) || 0,
          commission: earningsByBucket.get(k) || 0,
          activeAgents: activeAgentsByBucket.get(k)?.size || 0,
        };
      });

      // Active vs inactive: total agents vs unique agents who posted at least 1 rent request in range
      const totalAgents = await supabase
        .from('user_roles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'agent');
      const totalAgentCount = totalAgents.count || 0;
      const activeCurrSet = new Set(
        ((rentRequestsCurr.data ?? []) as Array<{ agent_id?: string | null }>)
          .map((r) => r.agent_id)
          .filter((id): id is string => !!id),
      );
      const activePrevSet = new Set(
        ((rentRequestsPrev.data ?? []) as Array<{ agent_id?: string | null }>)
          .map((r) => r.agent_id)
          .filter((id): id is string => !!id),
      );
      const activeCount = activeCurrSet.size;
      const activePrevCount = activePrevSet.size;

      return {
        kpis: {
          newAgents: { value: newAgentsCurrCount, prev: newAgentsPrev.count || 0 },
          rentRequests: { value: rentCurrCount, prev: rentRequestsPrev.count || 0 },
          commission: { value: earningsCurrTotal, prev: earningsPrevTotal },
          activeAgents: { value: activeCount, prev: activePrevCount },
        },
        trend,
        activity: {
          active: activeCount,
          inactive: Math.max(0, totalAgentCount - activeCount),
        },
        totalAgentCount,
      };
    },
    staleTime: 60_000,
  });

  const cards: Array<Omit<BriefCardProps, 'series' | 'changePct'> & { rawValue: number; series: number[]; prev: number; drillKey: DrillMetric }> = [
    {
      title: 'New Agents Onboarded',
      value: data?.kpis.newAgents.value ?? 0,
      icon: UserPlus,
      accent: 'primary',
      loading: isLoading,
      onClick: () => setActiveDrill('new-agents'),
      drillKey: 'new-agents',
      rawValue: data?.kpis.newAgents.value ?? 0,
      prev: data?.kpis.newAgents.prev ?? 0,
      series: data?.trend.map((t) => t.agents) ?? [],
    },
    {
      title: 'Rent Requests',
      value: data?.kpis.rentRequests.value ?? 0,
      icon: FileText,
      accent: 'sky',
      loading: isLoading,
      onClick: () => setActiveDrill('rent-requests'),
      drillKey: 'rent-requests',
      rawValue: data?.kpis.rentRequests.value ?? 0,
      prev: data?.kpis.rentRequests.prev ?? 0,
      series: data?.trend.map((t) => t.requests) ?? [],
    },
    {
      title: 'Commission Earned (UGX)',
      value: fmtMoney(data?.kpis.commission.value ?? 0),
      icon: Banknote,
      accent: 'emerald',
      loading: isLoading,
      onClick: () => setActiveDrill('commission'),
      drillKey: 'commission',
      rawValue: data?.kpis.commission.value ?? 0,
      prev: data?.kpis.commission.prev ?? 0,
      series: data?.trend.map((t) => t.commission) ?? [],
    },
    {
      title: 'Active Agents',
      value: data?.kpis.activeAgents.value ?? 0,
      icon: Activity,
      accent: 'amber',
      loading: isLoading,
      onClick: () => setActiveDrill('active-agents'),
      drillKey: 'active-agents',
      rawValue: data?.kpis.activeAgents.value ?? 0,
      prev: data?.kpis.activeAgents.prev ?? 0,
      series: data?.trend.map((t) => t.activeAgents) ?? [],
    },
  ];

  return (
    <div className="space-y-4 pb-20 sm:pb-4">
      {/* Date filter */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-border bg-card p-0.5 shadow-sm">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onRangeChange(opt.key)}
              className={cn(
                'px-3 sm:px-4 h-8 rounded-full text-xs font-semibold transition-all touch-manipulation',
                range === opt.key
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={range === opt.key}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Badge variant="outline" className="text-[10px] gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </Badge>
      </div>

      {/* Active Agents hero — most-visible KPI: agents who posted ≥1 rent request in range */}
      <ActiveAgentsHero
        value={data?.kpis.activeAgents.value ?? 0}
        prev={data?.kpis.activeAgents.prev ?? 0}
        totalAgents={data?.totalAgentCount ?? 0}
        loading={isLoading}
        range={range}
        onClick={() => setActiveDrill('active-agents')}
      />

      {/* Daily Briefs grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {cards.map((c) => (
          <BriefCard
            key={c.title}
            title={c.title}
            value={c.value}
            icon={c.icon}
            accent={c.accent}
            loading={c.loading}
            onClick={c.onClick}
            series={c.series}
            changePct={pctChange(c.rawValue, c.prev)}
          />
        ))}
      </div>

      {/* Performance trend chart */}
      <Card className="rounded-2xl border-border/50 p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Performance Trend</h3>
            <p className="text-[11px] text-muted-foreground">
              {range === '24h' ? 'Last 24 hours' : range === '7d' ? 'Last 7 days' : 'Last 30 days'}
            </p>
          </div>
        </div>
        <div className="h-56 sm:h-64 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.trend ?? []} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={32} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="agents" name="New agents" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="requests" name="Rent requests" stroke="hsl(199 89% 48%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="commission" name="Commission" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Activity distribution donut */}
      <Card className="rounded-2xl border-border/50 p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Agent Activity</h3>
            <p className="text-[11px] text-muted-foreground">Active vs Inactive in selected window</p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onOpenSection('directory')}>
            View
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="h-48 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  { name: 'Active', value: data?.activity.active ?? 0 },
                  { name: 'Inactive', value: data?.activity.inactive ?? 0 },
                ]}
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                dataKey="value"
              >
                <Cell fill="hsl(var(--primary))" />
                <Cell fill="hsl(var(--muted))" />
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Drill-down modal */}
      <BriefDrillDownModal
        open={activeDrill !== null}
        onOpenChange={(open) => {
          if (!open) setActiveDrill(null);
        }}
        metric={activeDrill}
        range={range}
        series={
          activeDrill
            ? cards.find((c) => c.drillKey === activeDrill)?.series ?? []
            : []
        }
        kpiValue={
          activeDrill ? cards.find((c) => c.drillKey === activeDrill)?.value ?? 0 : 0
        }
        changePct={
          activeDrill
            ? pctChange(
                cards.find((c) => c.drillKey === activeDrill)?.rawValue ?? 0,
                cards.find((c) => c.drillKey === activeDrill)?.prev ?? 0,
              )
            : 0
        }
        onOpenSection={onOpenSection}
      />
    </div>
  );
}

// Re-export helpers for tests if ever needed
export { fmtMoney, pctChange };

// silence unused import warning for isAfter (kept for future filtering use)
void isAfter;

/* ------------------------------------------------------------------
 * ActiveAgentsHero
 * Big, glanceable hero KPI for "Active Agents" — defined strictly as
 * unique agents who posted ≥1 rent (tenant) request in the selected
 * window. Surfaces share-of-fleet so Agent Ops can spot drop-offs.
 * ------------------------------------------------------------------ */
function ActiveAgentsHero({
  value,
  prev,
  totalAgents,
  loading,
  range,
  onClick,
}: {
  value: number;
  prev: number;
  totalAgents: number;
  loading?: boolean;
  range: DateRange;
  onClick: () => void;
}) {
  const pct = pctChange(value, prev);
  const isUp = pct >= 0;
  const share = totalAgents > 0 ? Math.min(100, (value / totalAgents) * 100) : 0;
  const rangeLabel = range === '24h' ? 'last 24h' : range === '7d' ? 'last 7 days' : 'last 30 days';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative w-full text-left overflow-hidden rounded-2xl border border-amber-300/50',
        'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-4 sm:p-6 shadow-lg',
        'hover:shadow-xl active:scale-[0.99] transition-all touch-manipulation',
      )}
    >
      <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/25">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/90">
                Active Agents
              </p>
              <p className="text-[10px] text-white/75 leading-tight">
                Posted ≥1 tenant request · {rangeLabel}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-end gap-3 flex-wrap">
            {loading ? (
              <Loader2 className="h-10 w-10 text-white animate-spin" />
            ) : (
              <span className="text-5xl sm:text-6xl font-extrabold text-white tabular-nums leading-none">
                {value.toLocaleString()}
              </span>
            )}
            {totalAgents > 0 && !loading && (
              <span className="text-sm font-semibold text-white/85 pb-1">
                / {totalAgents.toLocaleString()} total
              </span>
            )}
            {!loading && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold pb-1',
                  isUp ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800',
                )}
              >
                {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(pct).toFixed(0)}%
              </span>
            )}
          </div>

          {totalAgents > 0 && !loading && (
            <div className="mt-3 max-w-md">
              <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${share}%` }}
                />
              </div>
              <p className="text-[10px] text-white/85 mt-1">
                {share.toFixed(1)}% of fleet active · vs previous {value === prev ? 'flat' : `${prev.toLocaleString()}`}
              </p>
            </div>
          )}
        </div>

        <ChevronRight className="h-5 w-5 text-white/80 shrink-0 mt-1" />
      </div>
    </button>
  );
}