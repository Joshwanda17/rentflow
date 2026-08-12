import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import {
  CalendarIcon, Clock, TrendingUp, Users, Banknote, Target, RefreshCw, Activity, Search,
} from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfMonth, startOfYear, addDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';

type PresetKey = 'today' | 'yesterday' | 'five' | 'weekend' | 'month' | 'year' | 'custom';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'five', label: 'Last 5 days' },
  { key: 'weekend', label: 'Weekend' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
];

/** Most recent Saturday + Sunday pair (inclusive), based on local device date. */
function lastWeekend(now: Date): { start: Date; end: Date } {
  // Walk back to the most recent Saturday (day 6)
  let sat = startOfDay(now);
  while (sat.getDay() !== 6) sat = subDays(sat, 1);
  return { start: sat, end: endOfDay(addDays(sat, 1)) };
}

function resolveRange(preset: PresetKey, custom?: DateRange): { start: Date; end: Date; bucket: string } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now), bucket: 'hour' };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y), bucket: 'hour' };
    }
    case 'five':
      return { start: startOfDay(subDays(now, 4)), end: endOfDay(now), bucket: 'day' };
    case 'weekend': {
      const w = lastWeekend(now);
      return { start: w.start, end: w.end, bucket: 'hour' };
    }
    case 'month':
      return { start: startOfMonth(now), end: endOfDay(now), bucket: 'day' };
    case 'year':
      return { start: startOfYear(now), end: endOfDay(now), bucket: 'month' };
    case 'custom': {
      const from = custom?.from ? startOfDay(custom.from) : startOfDay(now);
      const to = custom?.to ? endOfDay(custom.to) : endOfDay(custom?.from ?? now);
      const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
      const bucket = days <= 1 ? 'hour' : days <= 62 ? 'day' : 'month';
      return { start: from, end: to, bucket };
    }
  }
}

interface CommandCenterData {
  range: { start: string; end: string; bucket: string };
  totals: {
    collected: number; collections_count: number; active_agents: number; tenants_paid: number;
    avg_collection: number; requests_count: number; requests_amount: number; days: number;
  };
  series: { bucket: string; collected: number; collections_count: number; requests_amount: number; requests_count: number }[];
  peak_hours: { hour: number; amount: number; count: number }[];
  agents: {
    agent_id: string; name: string; phone: string | null; avatar_url: string | null;
    collected: number; collections_count: number; tenants_paid: number; active_tenants: number;
    expected_daily: number; expected: number; expected_source: 'history' | 'projected';
    last_collection_at: string | null;
  }[];
  generated_at: string;
}

const num = (v: any) => Number(v ?? 0);
const compact = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : `${v}`;
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function AgentCollectionsCommandCenter() {
  const [preset, setPreset] = useState<PresetKey>('today');
  const [custom, setCustom] = useState<DateRange | undefined>();
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  const { start, end, bucket } = useMemo(() => resolveRange(preset, custom), [preset, custom]);
  const key = ['agent-collections-command-center', start.toISOString(), end.toISOString(), bucket];

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_agent_collections_command_center', {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
        p_bucket: bucket,
      });
      if (error) throw error;
      return data as unknown as CommandCenterData;
    },
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  // Live refresh when collections or rent requests change
  useEffect(() => {
    const channel = supabase
      .channel('agent-collections-command-center')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_collections' }, () => {
        qc.invalidateQueries({ queryKey: ['agent-collections-command-center'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rent_requests' }, () => {
        qc.invalidateQueries({ queryKey: ['agent-collections-command-center'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const totals = data?.totals;
  const series = (data?.series ?? []).map(s => ({
    label: bucket === 'hour' ? s.bucket.slice(11) : bucket === 'month' ? s.bucket : s.bucket.slice(5),
    collected: num(s.collected),
    requests: num(s.requests_amount),
    collectionsCount: num(s.collections_count),
    requestsCount: num(s.requests_count),
  }));
  const peak = (data?.peak_hours ?? []).map(h => ({ ...h, amount: num(h.amount), count: num(h.count), label: hourLabel(h.hour) }));
  const peakMax = Math.max(1, ...peak.map(p => p.amount));
  const topHour = peak.reduce((a, b) => (b.amount > (a?.amount ?? -1) ? b : a), peak[0]);

  const agents = useMemo(() => {
    const list = (data?.agents ?? []).map(a => ({
      ...a,
      collected: num(a.collected),
      expected: num(a.expected),
      pct: num(a.expected) > 0 ? Math.round((num(a.collected) / num(a.expected)) * 100) : null,
    }));
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter(a => (a.name || '').toLowerCase().includes(q) || (a.phone || '').includes(q)) : list;
    return filtered.sort((a, b) => b.collected - a.collected);
  }, [data, search]);

  const expectedTotal = agents.reduce((s, a) => s + a.expected, 0);
  const collectedTotal = num(totals?.collected);
  const coverage = expectedTotal > 0 ? Math.round((collectedTotal / expectedTotal) * 100) : null;

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 mr-auto">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Collections Command Center</h2>
          {isFetching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? 'default' : 'outline'}
              className="h-8 text-xs"
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
          {preset === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="secondary" className="h-8 text-xs">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  {custom?.from
                    ? `${format(custom.from, 'dd MMM')}${custom.to ? ` – ${format(custom.to, 'dd MMM')}` : ''}`
                    : 'Pick dates'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={custom}
                  onSelect={setCustom}
                  disabled={{ after: new Date() }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {format(start, 'dd MMM yyyy HH:mm')} → {format(end, 'dd MMM yyyy HH:mm')} · grouped by {bucket} · East Africa Time
        {data?.generated_at ? ` · updated ${format(new Date(data.generated_at), 'HH:mm:ss')}` : ''}
      </p>

      {error && (
        <Card className="p-4 border-destructive/40">
          <p className="text-sm text-destructive">Could not load collections data: {(error as any).message}</p>
        </Card>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Banknote className="h-3.5 w-3.5" /> Collected</div>
          <p className="text-lg font-bold mt-1">{formatUGX(collectedTotal)}</p>
          <p className="text-[11px] text-muted-foreground">{num(totals?.collections_count)} payments · avg {formatUGX(num(totals?.avg_collection))}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Target className="h-3.5 w-3.5" /> Expected</div>
          <p className="text-lg font-bold mt-1">{formatUGX(expectedTotal)}</p>
          <div className="mt-1.5">
            <Progress value={Math.min(100, coverage ?? 0)} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground mt-1">{coverage === null ? 'No expectation on record' : `${coverage}% of expected`}</p>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Active agents</div>
          <p className="text-lg font-bold mt-1">{num(totals?.active_agents)}</p>
          <p className="text-[11px] text-muted-foreground">{num(totals?.tenants_paid)} tenants paid</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> New rent requests</div>
          <p className="text-lg font-bold mt-1">{num(totals?.requests_count)}</p>
          <p className="text-[11px] text-muted-foreground">{formatUGX(num(totals?.requests_amount))} requested</p>
        </Card>
      </div>

      {/* Trend */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Collections trend</h3>
          <Badge variant="outline" className="text-[10px]">per {bucket}</Badge>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="collGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={compact} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v: any, n: any) => [formatUGX(Number(v)), n === 'collected' ? 'Collected' : n]} />
              <Area type="monotone" dataKey="collected" stroke="hsl(var(--primary))" fill="url(#collGrad)" strokeWidth={2} name="Collected" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Peak hours */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Peak payment hours</h3>
          </div>
          {topHour && topHour.amount > 0 && (
            <Badge className="text-[10px] bg-amber-500/15 text-amber-700 border-amber-500/30">
              Peak {hourLabel(topHour.hour)} · {formatUGX(topHour.amount)}
            </Badge>
          )}
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={peak}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={compact} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                formatter={(v: any) => formatUGX(Number(v))}
                labelFormatter={(l: any) => `Hour ${l} (EAT)`}
              />
              <Bar dataKey="amount" name="Collected" radius={[3, 3, 0, 0]}>
                {peak.map(p => (
                  <Cell key={p.hour} fill={p.amount >= peakMax * 0.75 ? 'hsl(38 92% 50%)' : 'hsl(var(--primary))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Hour of day when tenants' rent payments are recorded, in East Africa Time.
        </p>
      </Card>

      {/* Collections vs rent requests */}
      <Card className="p-3">
        <h3 className="text-sm font-semibold mb-2">Collections vs new rent requests</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={compact} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v: any) => formatUGX(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="collected" name="Collected" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="requests" name="Rent requested" stroke="hsl(262 83% 58%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Agents by collections vs expected */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="text-sm font-semibold mr-auto">Agents by collections vs expected</h3>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search agent"
              className="h-8 pl-7 text-xs w-48"
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading collections…</p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No agents match this range.</p>
        ) : (
          <div className="divide-y">
            {agents.slice(0, 100).map(a => (
              <div key={a.agent_id} className="py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.collections_count} payments · {a.tenants_paid}/{a.active_tenants} tenants paid
                    {a.expected_source === 'projected' && a.expected > 0 ? ' · projected target' : ''}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <Progress value={Math.min(100, a.pct ?? 0)} className="h-1.5 flex-1" />
                    <span
                      className={cn(
                        'text-[11px] font-semibold w-12 text-right',
                        a.pct === null ? 'text-muted-foreground'
                          : a.pct >= 90 ? 'text-emerald-600'
                          : a.pct >= 50 ? 'text-amber-600' : 'text-destructive',
                      )}
                    >
                      {a.pct === null ? '—' : `${a.pct}%`}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{formatUGX(a.collected)}</p>
                  <p className="text-[11px] text-muted-foreground">of {formatUGX(a.expected)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          Collected comes from recorded agent collections. Expected uses the daily-target snapshots for each day in
          range; days without a snapshot fall back to the agent's current daily target.
        </p>
      </Card>
    </div>
  );
}

export default AgentCollectionsCommandCenter;
