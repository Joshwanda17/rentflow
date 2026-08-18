import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, ArrowUpFromLine, Users } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';

/* ─────────────── shared range presets ─────────────── */
type RangeKey = 'today' | 'tomorrow' | 'five' | 'weekend' | 'seven' | 'monthly';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'five', label: '5 days' },
  { key: 'weekend', label: 'Weekend' },
  { key: 'seven', label: '7 days' },
  { key: 'monthly', label: 'Monthly' },
];

/** Days of forward window a preset needs (always counted from today). */
function rangeDays(key: RangeKey): number {
  const today = new Date();
  switch (key) {
    case 'today': return 1;
    case 'tomorrow': return 2;
    case 'five': return 5;
    case 'weekend': {
      // days from today through the coming Sunday (Sat+Sun inclusive)
      const dow = today.getDay(); // 0 Sun … 6 Sat
      return dow === 0 ? 1 : 8 - dow;
    }
    case 'seven': return 7;
    case 'monthly': return 30;
  }
}

/** Only the days a preset actually displays (tomorrow / weekend are slices). */
function sliceDays(key: RangeKey, rows: ProjectionRow[]): ProjectionRow[] {
  if (key === 'tomorrow') return rows.slice(1, 2);
  if (key === 'weekend') {
    return rows.filter((r) => {
      const d = new Date(`${r.day}T00:00:00`);
      const dow = d.getDay();
      return dow === 6 || dow === 0;
    });
  }
  return rows;
}

interface ProjectionRow {
  day: string;
  roi_payout: number;
  compounding: number;
}

function RangeFilter({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RANGES.map((r) => (
        <Button
          key={r.key}
          size="sm"
          variant={value === r.key ? 'default' : 'outline'}
          className="h-7 px-2.5 text-[11px]"
          onClick={() => onChange(r.key)}
        >
          {r.label}
        </Button>
      ))}
    </div>
  );
}

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });

/* ─────────────── 1. ROI projection graph ─────────────── */
export function PartnerRoiProjectionChart() {
  const [range, setRange] = useState<RangeKey>('today');
  const days = rangeDays(range);

  const { data, isLoading } = useQuery({
    queryKey: ['partner-ops-roi-projection', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_partner_forward_schedule', {
        p_days: days,
        p_streams: ['roi_payout', 'compounding'],
      });
      if (error) throw error;
      return (data as any)?.rows as ProjectionRow[] ?? [];
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => sliceDays(range, (data ?? []).map((r) => ({
    day: String(r.day),
    roi_payout: Number(r.roi_payout) || 0,
    compounding: Number(r.compounding) || 0,
  }))), [data, range]);

  const totalPayout = rows.reduce((s, r) => s + r.roi_payout, 0);
  const totalCompound = rows.reduce((s, r) => s + r.compounding, 0);

  return (
    <Card>
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <TrendingUp className="h-4 w-4 text-primary" /> Returns projection
          </CardTitle>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Payout vs compounded</span>
        </div>
        <RangeFilter value={range} onChange={setRange} />
        <div className="flex flex-wrap gap-4 pt-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">To be paid out</p>
            <p className="text-lg font-black tabular-nums text-primary">{formatUGX(totalPayout)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">To be compounded</p>
            <p className="text-lg font-black tabular-nums text-emerald-600">{formatUGX(totalCompound)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">No returns fall in this window.</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} width={44} />
                <Tooltip
                  formatter={(v: number, n: string) => [formatUGX(Number(v)), n === 'roi_payout' ? 'Paid out' : 'Compounded']}
                  labelFormatter={(l) => shortDay(String(l))}
                />
                <Legend formatter={(v) => (v === 'roi_payout' ? 'Paid out' : 'Compounded')} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="roi_payout" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="compounding" stackId="a" fill="hsl(var(--chart-2, var(--primary)))" fillOpacity={0.55} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────── 2. Recent portfolio withdrawals ─────────────── */
interface WithdrawalRow {
  id: string;
  partner_name: string;
  amount: number;
  status: string;
  requested_at: string | null;
  processing_date: string | null;
  portfolio_code: string | null;
  portfolio_name: string | null;
  roi_amount: number | null;
  roi_percentage: number | null;
  proxy_agent_name: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  partner_ops_approved: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  coo_approved: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  processed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  rejected: 'bg-destructive/10 text-destructive border-destructive/20',
};

const prettyStatus = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function PartnerRecentWithdrawals() {
  const { data, isLoading } = useQuery({
    queryKey: ['partner-ops-recent-withdrawals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_partner_ops_recent_withdrawals', { p_limit: 10 });
      if (error) throw error;
      return ((data as any)?.rows ?? []) as WithdrawalRow[];
    },
    staleTime: 30_000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <ArrowUpFromLine className="h-4 w-4 text-primary" /> Recent portfolio withdrawals
          <span className="ml-auto text-[10px] font-normal uppercase tracking-widest text-muted-foreground">Last 10 by status</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data?.length ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No portfolio withdrawals recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase">Portfolio</TableHead>
                  <TableHead className="text-[10px] uppercase">Partner</TableHead>
                  <TableHead className="text-right text-[10px] uppercase">Amount</TableHead>
                  <TableHead className="text-right text-[10px] uppercase">Returns</TableHead>
                  <TableHead className="text-[10px] uppercase">Status</TableHead>
                  <TableHead className="text-[10px] uppercase">Proxy agent</TableHead>
                  <TableHead className="text-[10px] uppercase">Processing date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-semibold">
                      {r.portfolio_name || r.portfolio_code || '—'}
                      {r.portfolio_code && r.portfolio_name && (
                        <span className="block text-[10px] font-normal text-muted-foreground">{r.portfolio_code}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.partner_name}</TableCell>
                    <TableCell className="text-right text-xs font-bold tabular-nums">{formatUGX(Number(r.amount) || 0)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {r.roi_amount != null ? formatUGX(Number(r.roi_amount)) : '—'}
                      {r.roi_percentage != null && (
                        <span className="block text-[10px] text-muted-foreground">{Number(r.roi_percentage)}%</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[10px]', STATUS_STYLE[r.status] ?? '')}>
                        {prettyStatus(r.status || 'unknown')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.proxy_agent_name || '—'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{dateLabel(r.processing_date ?? r.requested_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────── 3. New partner trend ─────────────── */
export function PartnerNewTrend() {
  const [range, setRange] = useState<RangeKey>('today');
  // Backward-looking window: tomorrow/weekend fall back to their day counts.
  const days = rangeDays(range);

  const { data, isLoading } = useQuery({
    queryKey: ['partner-ops-new-trend', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_partner_new_trend', { p_days: days });
      if (error) throw error;
      return data as any;
    },
    staleTime: 60_000,
  });

  const rows = ((data?.rows ?? []) as { day: string; new_count: number }[]).map((r) => ({
    day: String(r.day),
    new_count: Number(r.new_count) || 0,
  }));
  const total = Number(data?.total) || 0;
  const prev = Number(data?.prev_total) || 0;
  const pct = prev > 0 ? Math.round(((total - prev) / prev) * 100) : total > 0 ? 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <Users className="h-4 w-4 text-primary" /> New partners trend
          </CardTitle>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {Number(data?.total_partners) || 0} partners total
          </span>
        </div>
        <RangeFilter value={range} onChange={setRange} />
        <div className="flex items-end gap-3 pt-1">
          <p className="text-2xl font-black tabular-nums">{total}</p>
          <span className={cn('mb-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            pct >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive')}>
            {pct >= 0 ? '+' : ''}{pct}% vs prior {days} {days === 1 ? 'day' : 'days'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                <Tooltip formatter={(v: number) => [`${v}`, 'New partners']} labelFormatter={(l) => shortDay(String(l))} />
                <Bar dataKey="new_count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
