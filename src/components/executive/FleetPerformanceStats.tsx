import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { ACTIVE_RENT_STATUSES } from '@/hooks/useAgentCapacityMap';
import { Target, Banknote, Percent, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

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

/** Expected daily collection per agent (period-independent) from active rent requests. */
async function fetchExpectedDailyByAgent(): Promise<Record<string, number>> {
  const byAgent: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('rent_requests')
      .select('agent_id, daily_repayment')
      .in('status', ACTIVE_RENT_STATUSES)
      .not('agent_id', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) { console.error('[FleetPerformanceStats] expected page failed', error); break; }
    const rows = data || [];
    rows.forEach((r: any) => {
      if (!r.agent_id) return;
      byAgent[r.agent_id] = (byAgent[r.agent_id] || 0) + (Number(r.daily_repayment) || 0);
    });
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return byAgent;
}

/** Collected per agent for a period: sum repayments in window → map via rent_request → agent. */
async function fetchCollectedByAgent(start: Date, end: Date): Promise<Record<string, number>> {
  // 1) Paginate repayments in the window, accumulate per rent_request_id.
  const byRent: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('repayments')
      .select('rent_request_id, amount')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .range(from, from + PAGE - 1);
    if (error) { console.error('[FleetPerformanceStats] repayments page failed', error); break; }
    const rows = data || [];
    rows.forEach((r: any) => {
      if (!r.rent_request_id) return;
      byRent[r.rent_request_id] = (byRent[r.rent_request_id] || 0) + (Number(r.amount) || 0);
    });
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  // 2) Resolve rent_request → agent_id in batches.
  const rentIds = Object.keys(byRent);
  const byAgent: Record<string, number> = {};
  const BATCH = 200;
  for (let i = 0; i < rentIds.length; i += BATCH) {
    const slice = rentIds.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('rent_requests')
      .select('id, agent_id')
      .in('id', slice);
    if (error) { console.error('[FleetPerformanceStats] rent->agent map failed', error); continue; }
    (data || []).forEach((r: any) => {
      if (!r.agent_id) return;
      byAgent[r.agent_id] = (byAgent[r.agent_id] || 0) + (byRent[r.id] || 0);
    });
  }
  return byAgent;
}

async function fetchAgentNames(agentIds: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const BATCH = 100;
  for (let i = 0; i < agentIds.length; i += BATCH) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', agentIds.slice(i, i + BATCH));
    (data || []).forEach((p: any) => { names[p.id] = p.full_name || p.id.slice(0, 8); });
  }
  return names;
}

export function FleetPerformanceStats() {
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [sort, setSort] = useState<{ key: 'expected' | 'collected' | 'rate'; dir: 'asc' | 'desc' }>({ key: 'collected', dir: 'desc' });
  const [search, setSearch] = useState('');
  const { start, end, days } = useMemo(() => resolvePeriod(period), [period]);

  const { data: expectedByAgent = {}, isLoading: expLoading } = useQuery({
    queryKey: ['fleet-perf-expected-by-agent'],
    queryFn: fetchExpectedDailyByAgent,
    staleTime: 60_000,
  });

  const { data: collectedByAgent = {}, isLoading: colLoading } = useQuery({
    queryKey: ['fleet-perf-collected-by-agent', period],
    queryFn: () => fetchCollectedByAgent(start, end),
    staleTime: 30_000,
  });

  const agentIds = useMemo(() => {
    const set = new Set<string>([...Object.keys(expectedByAgent), ...Object.keys(collectedByAgent)]);
    return Array.from(set).sort();
  }, [expectedByAgent, collectedByAgent]);

  const { data: names = {} } = useQuery({
    queryKey: ['fleet-perf-agent-names', agentIds],
    queryFn: () => fetchAgentNames(agentIds),
    enabled: agentIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const rawRows = useMemo(() => {
    return agentIds
      .map((id) => {
        const expected = (expectedByAgent[id] || 0) * days;
        const collected = collectedByAgent[id] || 0;
        const rate = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
        return { id, name: names[id] || id.slice(0, 8), expected, collected, rate };
      })
      .filter((r) => r.expected > 0 || r.collected > 0);
  }, [agentIds, expectedByAgent, collectedByAgent, names, days]);

  const rows = useMemo(() => {
    const { key, dir } = sort;
    const sorted = [...rawRows].sort((a, b) => {
      let cmp = 0;
      if (key === 'expected') cmp = a.expected - b.expected;
      else if (key === 'collected') cmp = a.collected - b.collected;
      else cmp = a.rate - b.rate;
      return dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rawRows, sort]);

  const loading = expLoading || colLoading;
  const totalExpected = rows.reduce((s, r) => s + r.expected, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const rate = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;
  const rateTone = rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-amber-600' : 'text-destructive';
  const barTone = rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-destructive';

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
            <Stat icon={<Target className="h-3.5 w-3.5" />} label="Expected" value={formatUGX(totalExpected)} tone="text-violet-600" />
            <Stat icon={<Banknote className="h-3.5 w-3.5" />} label="Collected" value={formatUGX(totalCollected)} tone="text-primary" />
            <Stat icon={<Percent className="h-3.5 w-3.5" />} label="Collection rate" value={`${rate}%`} tone={rateTone} />
          </div>
          <div className="mt-2.5 h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${barTone} transition-all`} style={{ width: `${rate}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground tabular-nums">
            {formatUGX(totalCollected)} collected of {formatUGX(totalExpected)} expected ({days} day{days === 1 ? '' : 's'} · {rows.length} agent{rows.length === 1 ? '' : 's'})
          </p>

          {/* Agent-by-agent breakdown */}
          <div className="mt-3 rounded-lg border border-border overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 px-2.5 py-1.5 bg-muted/60 text-[10px] font-bold uppercase tracking-wide text-muted-foreground items-center">
              <span>Agent</span>
              <SortHeader label="Expected" sortKey="expected" sort={sort} onChange={setSort} align="right" />
              <SortHeader label="Collected" sortKey="collected" sort={sort} onChange={setSort} align="right" />
              <SortHeader label="Rate" sortKey="rate" sort={sort} onChange={setSort} align="right" />
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-border">
              {rows.length === 0 ? (
                <div className="px-2.5 py-4 text-center text-[11px] text-muted-foreground">
                  No agent activity in this period.
                </div>
              ) : (
                rows.map((r) => {
                  const tone = r.rate >= 80 ? 'text-emerald-600' : r.rate >= 50 ? 'text-amber-600' : 'text-destructive';
                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 px-2.5 py-1.5 text-[11px] items-center"
                    >
                      <span className="font-semibold text-foreground truncate">{r.name}</span>
                      <span className="text-right tabular-nums text-violet-600">{formatUGX(r.expected)}</span>
                      <span className="text-right tabular-nums text-primary font-semibold">{formatUGX(r.collected)}</span>
                      <span className={`text-right tabular-nums font-bold ${tone}`}>{r.rate}%</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
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

function SortHeader({
  label,
  sortKey,
  sort,
  onChange,
  align = 'left',
}: {
  label: string;
  sortKey: 'expected' | 'collected' | 'rate';
  sort: { key: 'expected' | 'collected' | 'rate'; dir: 'asc' | 'desc' };
  onChange: (s: { key: 'expected' | 'collected' | 'rate'; dir: 'asc' | 'desc' }) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => {
        if (active) {
          onChange({ key: sortKey, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
        } else {
          onChange({ key: sortKey, dir: 'desc' });
        }
      }}
      className={`flex items-center gap-1 select-none ${align === 'right' ? 'justify-end' : 'justify-start'} text-muted-foreground hover:text-foreground transition-colors`}
    >
      <span>{label}</span>
      <Icon className="h-3 w-3 opacity-70" />
    </button>
  );
}

export default FleetPerformanceStats;
