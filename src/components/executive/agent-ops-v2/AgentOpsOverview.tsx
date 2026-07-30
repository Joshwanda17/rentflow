import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format, subDays, subHours } from 'date-fns';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  Users, UserPlus, Activity, FileText, Home, Wallet, Banknote, TrendingDown,
  TrendingUp, ArrowRight, UsersRound, Network, Coins, Hourglass, Receipt, Trophy,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

export type OverviewRange = '24h' | '7d' | '1m';

const RANGES: { key: OverviewRange; label: string }[] = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '1m', label: '1M' },
];

function rangeStart(r: OverviewRange): Date {
  if (r === '24h') return subHours(new Date(), 24);
  if (r === '7d') return subDays(new Date(), 7);
  return subDays(new Date(), 30);
}

function fmtMoney(n: number): string {
  if (n >= 1e9) return `UGX ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `UGX ${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `UGX ${(n / 1e3).toFixed(1)}K`;
  return `UGX ${Math.round(n).toLocaleString()}`;
}

function fmtNum(n: number): string {
  return Number(n || 0).toLocaleString();
}

function pctDelta(curr: number, prev: number): number {
  if (!prev) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

interface KpiTileProps {
  title: string;
  value: string;
  delta?: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  spark?: number[];
  onClick?: () => void;
  loading?: boolean;
  subtitle?: string;
}

function KpiTile({ title, value, delta, icon: Icon, accent, spark, onClick, loading, subtitle }: KpiTileProps) {
  const up = (delta ?? 0) >= 0;
  const sparkData = (spark || []).map((y, x) => ({ x, y }));
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group text-left rounded-2xl border border-border/50 bg-card p-3 sm:p-4',
        'shadow-sm hover:shadow-md hover:border-primary/30 transition-all active:scale-[0.98]',
        'flex flex-col gap-1.5 min-h-[128px]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn('h-8 w-8 rounded-xl flex items-center justify-center shrink-0', accent)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        {typeof delta === 'number' && !loading && (
          <Badge
            variant="secondary"
            className={cn(
              'h-5 gap-0.5 px-1.5 text-[10px] font-semibold',
              up
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
            )}
          >
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(0)}%
          </Badge>
        )}
      </div>
      <p className="text-[11px] font-medium text-muted-foreground line-clamp-1">{title}</p>
      {loading ? (
        <Skeleton className="h-6 w-20" />
      ) : (
        <p className="text-lg sm:text-xl font-bold text-foreground leading-tight tabular-nums">{value}</p>
      )}
      {subtitle && !loading && (
        <p className="text-[10px] text-muted-foreground line-clamp-1 tabular-nums">{subtitle}</p>
      )}
      <div className="h-8 -mx-1 -mb-1 mt-auto">
        {sparkData.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
              <Area type="monotone" dataKey="y" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="hsl(var(--primary))" fillOpacity={0.15} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </button>
  );
}

interface OverviewPayload {
  kpis: Record<string, number>;
  listings_funnel: { listed: number; verified: number; placed: number };
  trend: Array<{ day: string; agents: number; requests: number; collections: number; commission: number; active_agents: number; expected?: number; pending?: number }>;
  top_performers?: Array<{
    user_id: string; name: string; phone: string | null; category: 'Agent' | 'Sub-Agent';
    collected: number; collections: number; commission: number;
  }>;
  generated_at: string;
}

export interface AgentOpsOverviewProps {
  onOpenSection: (key: string) => void;
}

export function AgentOpsOverview({ onOpenSection }: AgentOpsOverviewProps) {
  const qc = useQueryClient();
  const [range, setRange] = useState<OverviewRange>('7d');
  const start = useMemo(() => rangeStart(range).toISOString(), [range]);

  useEffect(() => {
    const ch = supabase
      .channel('agent-ops-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'general_ledger' }, () => qc.invalidateQueries({ queryKey: ['agent-ops-overview'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rent_requests' }, () => qc.invalidateQueries({ queryKey: ['agent-ops-overview'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_collections' }, () => qc.invalidateQueries({ queryKey: ['agent-ops-overview'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'house_listings' }, () => qc.invalidateQueries({ queryKey: ['agent-ops-overview'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { data, isLoading } = useQuery({
    queryKey: ['agent-ops-overview', range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_agent_ops_overview' as any, {
        p_range_start: start,
        p_range_end: new Date().toISOString(),
      });
      if (error) throw error;
      return data as unknown as OverviewPayload;
    },
    staleTime: 60_000,
  });

  const k = data?.kpis || ({} as Record<string, number>);
  const trend = data?.trend || [];
  const trendLabelKey = range === '24h' ? 'day' : 'day';

  const trendData = trend.map((t) => ({
    label: format(new Date(t.day), range === '1m' ? 'd MMM' : 'EEE'),
    agents: t.agents,
    requests: t.requests,
    activeAgents: t.active_agents,
    collections: t.collections,
    commission: t.commission,
    collected: t.collections,
    pending: Number(t.pending || 0),
  }));

  const rentPipelineData = [
    { name: 'Pending', value: Number(k.rent_pending || 0), fill: 'hsl(var(--muted-foreground))' },
    { name: 'Approved', value: Number(k.rent_approved || 0), fill: 'hsl(199 89% 48%)' },
    { name: 'Repaying', value: Number(k.rent_repaying || 0), fill: 'hsl(160 84% 39%)' },
    { name: 'Rejected', value: Number(k.rent_rejected || 0), fill: 'hsl(0 84% 60%)' },
  ];

  const funnel = data?.listings_funnel || { listed: 0, verified: 0, placed: 0 };
  const listingsData = [
    { name: 'Listed', value: funnel.listed },
    { name: 'Verified', value: funnel.verified },
    { name: 'Placed', value: funnel.placed },
  ];

  return (
    <div className="space-y-4">
      {/* Range switch */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-foreground">Agent Operations Overview</h2>
          <p className="text-xs text-muted-foreground">All agents, all activities — one glance.</p>
        </div>
        <div className="inline-flex rounded-full bg-muted p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn(
                'px-3 py-1 text-xs font-semibold rounded-full transition-colors',
                range === r.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Row A — network KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <KpiTile
          title="Total Agents"
          value={fmtNum(k.total_agents || 0)}
          delta={pctDelta(k.total_agents || 0, k.total_agents_prev || 0)}
          subtitle={`+${fmtNum(k.new_agents_curr || 0)} new this period`}
          icon={Users}
          accent="bg-primary"
          onClick={() => onOpenSection('directory')}
          loading={isLoading}
        />
        <KpiTile
          title="Active Agents"
          value={fmtNum(k.active_agents_curr || 0)}
          delta={pctDelta(k.active_agents_curr || 0, k.active_agents_prev || 0)}
          subtitle={`of ${fmtNum(k.total_agents || 0)} agents`}
          icon={Activity}
          accent="bg-emerald-600"
          spark={trendData.map((t) => t.activeAgents)}
          onClick={() => onOpenSection('directory')}
          loading={isLoading}
        />
        <KpiTile
          title="Total Sub-Agents"
          value={fmtNum(k.total_subagents || 0)}
          delta={pctDelta(k.total_subagents || 0, k.total_subagents_prev || 0)}
          subtitle={`+${fmtNum(k.new_subagents_curr || 0)} new this period`}
          icon={UsersRound}
          accent="bg-sky-600"
          onClick={() => onOpenSection('sub-agents')}
          loading={isLoading}
        />
        <KpiTile
          title="Active Sub-Agents"
          value={fmtNum(k.active_subagents_curr || 0)}
          delta={pctDelta(k.active_subagents_curr || 0, k.active_subagents_prev || 0)}
          subtitle={`of ${fmtNum(k.total_subagents || 0)} sub-agents`}
          icon={Network}
          accent="bg-indigo-600"
          onClick={() => onOpenSection('sub-agents')}
          loading={isLoading}
        />
      </div>

      {/* Row A2 — money KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <KpiTile
          title="Total Collected"
          value={fmtMoney(k.collections_curr || 0)}
          delta={pctDelta(k.collections_curr || 0, k.collections_prev || 0)}
          subtitle={`${fmtMoney(k.collections_today || 0)} today`}
          icon={Wallet}
          accent="bg-emerald-700"
          spark={trendData.map((t) => t.collected)}
          onClick={() => onOpenSection('daily-collections-report')}
          loading={isLoading}
        />
        <KpiTile
          title="Pending Collections"
          value={fmtMoney(k.pending_collections || 0)}
          subtitle="Outstanding on live rent plans"
          icon={Hourglass}
          accent="bg-rose-600"
          spark={trendData.map((t) => t.pending)}
          onClick={() => onOpenSection('allocation-report')}
          loading={isLoading}
        />
        <KpiTile
          title="Total Collections"
          value={fmtNum(k.collections_count_curr || 0)}
          delta={pctDelta(k.collections_count_curr || 0, k.collections_count_prev || 0)}
          subtitle={`${fmtNum(k.collections_today_count || 0)} today`}
          icon={Receipt}
          accent="bg-teal-600"
          onClick={() => onOpenSection('daily-collections-report')}
          loading={isLoading}
        />
        <KpiTile
          title="Commissions Paid Out"
          value={fmtMoney(k.commission_curr || 0)}
          delta={pctDelta(k.commission_curr || 0, k.commission_prev || 0)}
          icon={Coins}
          accent="bg-fuchsia-600"
          spark={trendData.map((t) => t.commission)}
          onClick={() => onOpenSection('earnings')}
          loading={isLoading}
        />
      </div>

      {/* Rent collections — pending vs collected */}
      <Card className="rounded-2xl border-border/50 p-3 sm:p-4 w-full">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold">Rent Collections</h3>
            <p className="text-[11px] text-muted-foreground">Collected (green) vs still pending (red), UGX</p>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="pendingFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(0 84% 60%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => fmtMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="pending" name="Pending" stroke="hsl(0 84% 60%)" strokeWidth={2} fill="url(#pendingFill)" dot={false} />
              <Area type="monotone" dataKey="collected" name="Collected" stroke="hsl(160 84% 39%)" strokeWidth={2} fill="url(#collectedFill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Latest rent requests */}
      <LatestRentRequests onViewAll={() => onOpenSection('pipeline')} />

      {/* Top performers */}
      <TopPerformers rows={data?.top_performers || []} loading={isLoading} />

      {/* Row B — trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="rounded-2xl border-border/50 p-3 sm:p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold">Agent Activity</h3>
              <p className="text-[11px] text-muted-foreground">New / Active agents & rent requests</p>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="activeAgents" name="Active" stroke="hsl(160 84% 39%)" fill="hsl(160 84% 39%)" fillOpacity={0.2} />
                <Area type="monotone" dataKey="agents" name="New" stroke="hsl(199 89% 48%)" fill="hsl(199 89% 48%)" fillOpacity={0.2} />
                <Area type="monotone" dataKey="requests" name="Requests" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-2xl border-border/50 p-3 sm:p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold">Commission vs Collections</h3>
              <p className="text-[11px] text-muted-foreground">Wallet commission credits & field collections (UGX)</p>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="collections" name="Collections" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="commission" name="Commission" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row C — three mini charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="rounded-2xl border-border/50 p-3 sm:p-4">
          <h3 className="text-sm font-semibold mb-2">Listings Funnel</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={listingsData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="value" fill="hsl(38 92% 50%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-2xl border-border/50 p-3 sm:p-4">
          <h3 className="text-sm font-semibold mb-2">Rent Pipeline</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rentPipelineData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {rentPipelineData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-2xl border-border/50 p-3 sm:p-4">
          <h3 className="text-sm font-semibold mb-2">Advance Health</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={advanceDonut} dataKey="value" nameKey="name" innerRadius={30} outerRadius={55} paddingAngle={2}>
                  {advanceDonut.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row D — operational tables */}
      <Card className="rounded-2xl border-border/50 p-3 sm:p-4">
        <Tabs defaultValue="top-agents">
          <TabsList className="mb-3">
            <TabsTrigger value="top-agents">Top Agents</TabsTrigger>
            <TabsTrigger value="recent-requests">Recent Requests</TabsTrigger>
            <TabsTrigger value="recent-verifs">Recent Verifications</TabsTrigger>
            <TabsTrigger value="at-risk">At-Risk</TabsTrigger>
          </TabsList>
          <TabsContent value="top-agents"><TopAgentsPreview onOpen={() => onOpenSection('leaderboard')} /></TabsContent>
          <TabsContent value="recent-requests"><RecentRequestsPreview onOpen={() => onOpenSection('pipeline')} /></TabsContent>
          <TabsContent value="recent-verifs"><RecentVerificationsPreview /></TabsContent>
          <TabsContent value="at-risk"><AtRiskAgentsPreview onOpen={() => onOpenSection('advance-repayments')} /></TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

// ---------- Sub-preview tables ----------

function TopAgentsPreview({ onOpen }: { onOpen: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-ops-top-agents'],
    queryFn: async () => {
      const since = subDays(new Date(), 30).toISOString();
      const { data } = await supabase
        .from('general_ledger')
        .select('user_id, amount')
        .eq('ledger_scope', 'wallet')
        .in('direction', ['cash_in', 'credit'])
        .in('category', ['agent_commission_earned', 'agent_commission', 'agent_bonus'])
        .gte('created_at', since)
        .limit(2000);
      const map = new Map<string, number>();
      (data || []).forEach((r: any) => map.set(r.user_id, (map.get(r.user_id) || 0) + Number(r.amount || 0)));
      const top = Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([user_id, total]) => ({ user_id, total }));
      if (top.length === 0) return [];
      const { data: profs } = await supabase
        .from('profiles').select('id, full_name, phone').in('id', top.map((t) => t.user_id));
      const pm = new Map((profs || []).map((p: any) => [p.id, p]));
      return top.map((t) => ({ ...t, profile: pm.get(t.user_id) }));
    },
    staleTime: 300_000,
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground p-4 text-center">No commission data in the last 30 days.</p>;
  return (
    <div className="space-y-1">
      {data.map((row: any, i: number) => (
        <div key={row.user_id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
          <span className="w-5 text-xs font-bold text-muted-foreground tabular-nums">{i + 1}</span>
          <span className="flex-1 text-sm truncate">{row.profile?.full_name || row.user_id.slice(0, 8)}</span>
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">{row.profile?.phone || ''}</span>
          <span className="text-sm font-semibold tabular-nums">{fmtMoney(row.total)}</span>
        </div>
      ))}
      <button onClick={onOpen} className="w-full text-xs text-primary hover:underline flex items-center justify-center gap-1 pt-2">
        Open leaderboard <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function RecentRequestsPreview({ onOpen }: { onOpen: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-ops-recent-requests'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rent_requests')
        .select('id, agent_id, amount_requested, status, created_at, tenant_id')
        .order('created_at', { ascending: false })
        .limit(10);
      if (!data || data.length === 0) return [];
      const ids = Array.from(new Set(data.flatMap((r: any) => [r.agent_id, r.tenant_id]).filter(Boolean)));
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const pm = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      return data.map((r: any) => ({ ...r, agent_name: pm.get(r.agent_id) || '—', tenant_name: pm.get(r.tenant_id) || '—' }));
    },
    staleTime: 60_000,
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground p-4 text-center">No recent rent requests.</p>;
  return (
    <div className="space-y-1">
      {data.map((r: any) => (
        <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0 text-sm">
          <span className="text-xs text-muted-foreground w-16">{format(new Date(r.created_at), 'd MMM HH:mm')}</span>
          <span className="flex-1 truncate">{r.tenant_name} <span className="text-muted-foreground">← {r.agent_name}</span></span>
          <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
          <span className="font-semibold tabular-nums text-xs">{fmtMoney(r.amount_requested || 0)}</span>
        </div>
      ))}
      <button onClick={onOpen} className="w-full text-xs text-primary hover:underline flex items-center justify-center gap-1 pt-2">
        Open pipeline <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function RecentVerificationsPreview() {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-ops-recent-verifs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('house_listings')
        .select('id, agent_id, verified_at, region, monthly_rent')
        .eq('verified', true)
        .not('verified_at', 'is', null)
        .order('verified_at', { ascending: false })
        .limit(10);
      if (!data || data.length === 0) return [];
      const ids = Array.from(new Set(data.map((r: any) => r.agent_id).filter(Boolean)));
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const pm = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      return data.map((r: any) => ({ ...r, agent_name: pm.get(r.agent_id) || '—' }));
    },
    staleTime: 60_000,
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground p-4 text-center">No recent verifications.</p>;
  return (
    <div className="space-y-1">
      {data.map((r: any) => (
        <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0 text-sm">
          <span className="text-xs text-muted-foreground w-16">{format(new Date(r.verified_at), 'd MMM HH:mm')}</span>
          <span className="flex-1 truncate">{r.region || '—'} <span className="text-muted-foreground">by {r.agent_name}</span></span>
          <span className="font-semibold tabular-nums text-xs">{fmtMoney(r.monthly_rent || 0)}</span>
        </div>
      ))}
    </div>
  );
}

function AtRiskAgentsPreview({ onOpen }: { onOpen: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-ops-at-risk'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_advances')
        .select('agent_id, outstanding_balance, arrears_balance, status')
        .in('status', ['active', 'overdue'])
        .or('status.eq.overdue,arrears_balance.gt.0')
        .order('arrears_balance', { ascending: false })
        .limit(10);
      if (!data || data.length === 0) return [];
      const ids = Array.from(new Set(data.map((r: any) => r.agent_id).filter(Boolean)));
      const { data: profs } = await supabase.from('profiles').select('id, full_name, phone').in('id', ids);
      const pm = new Map((profs || []).map((p: any) => [p.id, p]));
      return data.map((r: any) => ({ ...r, profile: pm.get(r.agent_id) }));
    },
    staleTime: 60_000,
  });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground p-4 text-center">No agents at risk. 🎉</p>;
  return (
    <div className="space-y-1">
      {data.map((r: any) => (
        <div key={r.agent_id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0 text-sm">
          <span className="flex-1 truncate">{r.profile?.full_name || r.agent_id.slice(0, 8)}</span>
          <Badge variant={r.status === 'overdue' ? 'destructive' : 'outline'} className="text-[10px]">{r.status}</Badge>
          <span className="text-xs text-muted-foreground tabular-nums">Arrears: {fmtMoney(r.arrears_balance || 0)}</span>
          <span className="font-semibold tabular-nums text-xs">{fmtMoney(r.outstanding_balance || 0)}</span>
        </div>
      ))}
      <button onClick={onOpen} className="w-full text-xs text-primary hover:underline flex items-center justify-center gap-1 pt-2">
        Open repayments monitor <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}