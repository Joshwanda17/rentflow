import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { ACTIVE_RENT_STATUSES } from '@/hooks/useAgentCapacityMap';
import { Target, Banknote, Percent, Loader2 } from 'lucide-react';

type PeriodKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'last_month';

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last week' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
];

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

/** Resolve a period to [start, end) and the number of calendar days it spans. */
function resolvePeriod(key: PeriodKey): { start: Date; end: Date; days: number } {
  const now = new Date();
  const today = startOfDay(now);
  switch (key) {
    case 'today':
      return { start: today, end: now, days: 1 };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { start: y, end: today, days: 1 };
    }
    case 'last7': {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { start: s, end: now, days: 7 };
    }
    case 'last30': {
      const s = new Date(today); s.setDate(s.getDate() - 29);
      return { start: s, end: now, days: 30 };
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const days = Math.floor((today.getTime() - s.getTime()) / 86_400_000) + 1;
      return { start: s, end: now, days };
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 1);
      const days = Math.round((e.getTime() - s.getTime()) / 86_400_000);
      return { start: s, end: e, days };
    }
  }
}

async function sumCollected(start: Date, end: Date): Promise<number> {
  let total = 0;
  const PAGE = 1000;
  let from = 0;
  // Paginate repayments in the window and sum amounts client-side.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('repayments')
      .select('amount')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .range(from, from + PAGE - 1);
    if (error) { console.error('[FleetPerformanceStats] repayments page failed', error); break; }
    const rows = data || [];
    total += rows.reduce((s, r: any) => s + (Number(r.amount) || 0), 0);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return total;
}

async function sumExpectedDaily(): Promise<number> {
  let total = 0;
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('rent_requests')
      .select('daily_repayment')
      .in('status', ACTIVE_RENT_STATUSES)
      .not('agent_id', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) { console.error('[FleetPerformanceStats] expected page failed', error); break; }
    const rows = data || [];
    total += rows.reduce((s, r: any) => s + (Number(r.daily_repayment) || 0), 0);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return total;
}

export function FleetPerformanceStats() {
  const [period, setPeriod] = useState<PeriodKey>('today');

  // Expected-daily is period-independent — cache it once.
  const { data: expectedDaily = 0, isLoading: expLoading } = useQuery({
    queryKey: ['fleet-perf-expected-daily'],
    queryFn: sumExpectedDaily,
    staleTime: 60_000,
  });

  const { start, end, days } = useMemo(() => resolvePeriod(period), [period]);

  const { data: collected = 0, isLoading: colLoading } = useQuery({
    queryKey: ['fleet-perf-collected', period],
    queryFn: () => sumCollected(start, end),
    staleTime: 30_000,
  });

  const loading = expLoading || colLoading;
  const expected = expectedDaily * days;
  const rate = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
  const rateTone =
    rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-destructive';
  const barTone =
    rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-destructive';

  return (
    <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Fleet performance · Expected vs Collected
        </p>
        <div className="flex items-center gap-1 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors ${
                period === p.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={<Target className="h-3.5 w-3.5" />} label="Expected" value={formatUGX(expected)} tone="text-violet-600" />
            <Stat icon={<Banknote className="h-3.5 w-3.5" />} label="Collected" value={formatUGX(collected)} tone="text-primary" />
            <Stat icon={<Percent className="h-3.5 w-3.5" />} label="Collection rate" value={`${rate}%`} tone={rateTone} />
          </div>
          <div className="mt-2.5 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${barTone} transition-all`} style={{ width: `${rate}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground tabular-nums">
            {formatUGX(collected)} collected of {formatUGX(expected)} expected ({days} day{days === 1 ? '' : 's'} · all active agents)
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <div className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 text-sm font-extrabold tabular-nums text-foreground truncate">{value}</div>
    </div>
  );
}

export default FleetPerformanceStats;