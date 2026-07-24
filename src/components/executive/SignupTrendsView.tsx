import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  format,
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  startOfMonth,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  differenceInCalendarDays,
} from 'date-fns';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { UserCheck, UserPlus, Share2, TrendingUp, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';

type RangePreset = 'last_7' | 'last_30' | 'last_90' | 'last_180' | 'custom';
type Granularity = 'day' | 'week' | 'month';

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  referrer_id: string | null;
  signup_source: string | null;
}

function rangeBounds(preset: RangePreset, cs: string, ce: string) {
  const now = new Date();
  switch (preset) {
    case 'last_7':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case 'last_30':
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case 'last_90':
      return { start: startOfDay(subDays(now, 89)), end: endOfDay(now) };
    case 'last_180':
      return { start: startOfDay(subDays(now, 179)), end: endOfDay(now) };
    case 'custom':
      return { start: startOfDay(new Date(cs)), end: endOfDay(new Date(ce)) };
  }
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SOURCE_COLORS = ['hsl(var(--primary))', 'hsl(var(--muted-foreground))', 'hsl(24 95% 53%)', 'hsl(142 71% 45%)', 'hsl(262 83% 58%)'];

export function SignupTrendsView() {
  const now = new Date();
  const [preset, setPreset] = useState<RangePreset>('last_30');
  const [customStart, setCustomStart] = useState(format(subDays(now, 29), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(now, 'yyyy-MM-dd'));

  const { start, end } = rangeBounds(preset, customStart, customEnd);
  const spanDays = differenceInCalendarDays(end, start) + 1;
  const granularity: Granularity = spanDays <= 45 ? 'day' : spanDays <= 120 ? 'week' : 'month';

  const prevStart = new Date(start.getTime() - spanDays * 86400000);
  const prevEnd = new Date(start.getTime() - 1);

  // Row cap for chart/table sampling. KPIs are computed from exact server counts
  // (see queries below) so they remain correct even if this cap is hit.
  const ROW_CAP = 60000;

  // Signups in current range
  const { data: current, isLoading } = useQuery({
    queryKey: ['signup-trends-current', start.toISOString(), end.toISOString()],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProfileRow[]> => {
      const rows: ProfileRow[] = [];
      const pageSize = 1000;
      let offset = 0;
      while (offset < ROW_CAP) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, phone, created_at, referrer_id, signup_source')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...(data as ProfileRow[]));
        if (data.length < pageSize) break;
        offset += pageSize;
      }
      return rows;
    },
  });

  // Exact server-side counts drive the KPI cards (independent of the row cap).
  const { data: totals } = useQuery({
    queryKey: ['signup-trends-totals', start.toISOString(), end.toISOString()],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [totalRes, referredRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString()),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .not('referrer_id', 'is', null),
      ]);
      return {
        total: totalRes.count || 0,
        referred: referredRes.count || 0,
      };
    },
  });

  const { data: prevCount } = useQuery({
    queryKey: ['signup-trends-prev-count', prevStart.toISOString(), prevEnd.toISOString()],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', prevStart.toISOString())
        .lte('created_at', prevEnd.toISOString());
      return count || 0;
    },
  });

  const rows = current || [];
  const totalSignups = totals?.total ?? 0;
  const referred = totals?.referred ?? 0;
  const organic = Math.max(0, totalSignups - referred);
  const sampleTruncated = totalSignups > rows.length;
  const referralShare = totalSignups > 0 ? Math.round((referred / totalSignups) * 100) : 0;
  const growthPct = (prevCount || 0) > 0 ? Math.round(((totalSignups - (prevCount || 0)) / (prevCount || 0)) * 100) : 0;
  const avgPerDay = spanDays > 0 ? Math.round(totalSignups / spanDays) : 0;

  // Trend buckets
  const trend = useMemo(() => {
    const buckets: Record<string, { key: string; label: string; total: number; referred: number; organic: number }> = {};
    const seed = (d: Date, label: string) => {
      const key = d.toISOString();
      if (!buckets[key]) buckets[key] = { key, label, total: 0, referred: 0, organic: 0 };
      return buckets[key];
    };
    if (granularity === 'day') {
      eachDayOfInterval({ start, end }).forEach((d) => seed(startOfDay(d), format(d, 'MMM d')));
    } else if (granularity === 'week') {
      eachWeekOfInterval({ start, end }).forEach((d) => seed(startOfWeek(d), format(d, 'MMM d')));
    } else {
      eachMonthOfInterval({ start, end }).forEach((d) => seed(startOfMonth(d), format(d, 'MMM yyyy')));
    }
    for (const r of rows) {
      const d = new Date(r.created_at);
      const bucketDate =
        granularity === 'day' ? startOfDay(d) : granularity === 'week' ? startOfWeek(d) : startOfMonth(d);
      const key = bucketDate.toISOString();
      const label =
        granularity === 'day'
          ? format(bucketDate, 'MMM d')
          : granularity === 'week'
          ? format(bucketDate, 'MMM d')
          : format(bucketDate, 'MMM yyyy');
      const b = buckets[key] || seed(bucketDate, label);
      b.total += 1;
      if (r.referrer_id) b.referred += 1;
      else b.organic += 1;
    }
    return Object.values(buckets).sort((a, b) => a.key.localeCompare(b.key));
  }, [rows, granularity, start, end]);

  // Day-of-week distribution
  const dow = useMemo(() => {
    const counts = Array(7).fill(0);
    for (const r of rows) counts[new Date(r.created_at).getDay()] += 1;
    return counts.map((v, i) => ({ day: DOW_LABELS[i], signups: v }));
  }, [rows]);

  // Source pie
  const sourceMix = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = (r.signup_source || (r.referrer_id ? 'referral' : 'direct')).toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [rows]);

  // Top days
  const topDays = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = format(new Date(r.created_at), 'yyyy-MM-dd');
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([date, signups]) => ({ date, signups, label: format(new Date(date), 'EEE, MMM d') }))
      .sort((a, b) => b.signups - a.signups)
      .slice(0, 10);
  }, [rows]);

  const recent = rows.slice(0, 25).map((r) => ({
    id: r.id,
    when: format(new Date(r.created_at), 'MMM d, HH:mm'),
    name: r.full_name || '—',
    phone: r.phone || '—',
    source: r.referrer_id ? 'Referral' : r.signup_source ? r.signup_source : 'Direct',
  }));

  const recentColumns: Column<(typeof recent)[number]>[] = [
    { key: 'when', label: 'When' },
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    {
      key: 'source',
      label: 'Source',
      render: (v) => {
        const isRef = String(v) === 'Referral';
        return (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isRef ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {String(v)}
          </span>
        );
      },
    },
  ];

  const topDaysColumns: Column<(typeof topDays)[number]>[] = [
    { key: 'label', label: 'Day' },
    { key: 'signups', label: 'Signups', render: (v) => <span className="font-semibold">{v as number}</span> },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
          <UserCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Signup Trends</h2>
          <p className="text-xs text-muted-foreground">
            {format(start, 'MMM d, yyyy')} → {format(end, 'MMM d, yyyy')} · {granularity} view
          </p>
        </div>
      </div>

      {/* Range selector */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Date range</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { v: 'last_7', l: '7 days' },
              { v: 'last_30', l: '30 days' },
              { v: 'last_90', l: '90 days' },
              { v: 'last_180', l: '180 days' },
              { v: 'custom', l: 'Custom' },
            ] as { v: RangePreset; l: string }[]
          ).map((opt) => (
            <Button
              key={opt.v}
              size="sm"
              variant={preset === opt.v ? 'default' : 'outline'}
              onClick={() => setPreset(opt.v)}
            >
              {opt.l}
            </Button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Start</Label>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <KPICard
          title="Signups"
          value={totalSignups.toLocaleString()}
          icon={UserPlus}
          loading={isLoading}
          trend={prevCount !== undefined ? { value: growthPct, label: 'vs prev period' } : undefined}
        />
        <KPICard
          title="Avg / day"
          value={avgPerDay.toLocaleString()}
          icon={TrendingUp}
          color="bg-green-500/10 text-green-600"
          loading={isLoading}
        />
        <KPICard
          title="Referred"
          value={referred.toLocaleString()}
          icon={Share2}
          color="bg-purple-500/10 text-purple-600"
          loading={isLoading}
          subtitle={`${referralShare}% share`}
        />
        <KPICard
          title="Organic"
          value={organic.toLocaleString()}
          icon={UserCheck}
          color="bg-orange-500/10 text-orange-600"
          loading={isLoading}
          subtitle={`${100 - referralShare}% share`}
        />
      </div>

      {/* Main trend chart */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h3 className="text-sm font-semibold">Signups over time</h3>
          {sampleTruncated && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              Chart sample: {rows.length.toLocaleString()} / {totalSignups.toLocaleString()} rows
            </span>
          )}
        </div>
        {trend.length === 0 ? (
          <p className="text-xs text-muted-foreground py-12 text-center">No signups in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="referredG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="organicG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" className="text-[10px]" />
              <YAxis allowDecimals={false} className="text-[10px]" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                stackId="1"
                dataKey="organic"
                name="Organic"
                stroke="hsl(var(--muted-foreground))"
                fill="url(#organicG)"
              />
              <Area
                type="monotone"
                stackId="1"
                dataKey="referred"
                name="Referred"
                stroke="hsl(var(--primary))"
                fill="url(#referredG)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Day-of-week + source pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <h3 className="text-sm font-semibold mb-3">Signups by day of week</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dow}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" className="text-[10px]" />
              <YAxis allowDecimals={false} className="text-[10px]" />
              <Tooltip />
              <Bar dataKey="signups" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <h3 className="text-sm font-semibold mb-3">Source mix</h3>
          {sourceMix.length === 0 ? (
            <p className="text-xs text-muted-foreground py-12 text-center">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sourceMix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {sourceMix.map((_, i) => (
                    <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top days + recent signups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <h3 className="text-sm font-semibold mb-3">Top acquisition days</h3>
          <ExecutiveDataTable data={topDays} columns={topDaysColumns} loading={isLoading} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
          <h3 className="text-sm font-semibold mb-3">Recent signups</h3>
          <ExecutiveDataTable data={recent} columns={recentColumns} loading={isLoading} />
        </div>
      </div>
    </div>
  );
}