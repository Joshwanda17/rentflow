import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, TrendingDown, Minus, CalendarRange } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid } from 'recharts';

type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

const GRAN: Record<Granularity, { label: string; over: string; periods: number }> = {
  day: { label: 'Day', over: 'Day over day', periods: 14 },
  week: { label: 'Week', over: 'Week over week', periods: 12 },
  month: { label: 'Month', over: 'Month over month', periods: 12 },
  quarter: { label: 'Quarter', over: 'Quarter over quarter', periods: 8 },
  year: { label: 'Year', over: 'Year over year', periods: 5 },
};

const TZ = 'Africa/Kampala';

const fmtUgx = (n: number) => `UGX ${Math.round(n).toLocaleString()}`;

interface TxLite {
  amount: number | null;
  direction: string | null;
  internal_date: string | null;
}

interface Bucket {
  key: string;
  label: string;
  start: number;
  in: number;
  out: number;
  net: number;
  count: number;
}

/** Date parts (year, month, day) of a timestamp as seen in the Kampala tz. */
function partsInTz(ms: number): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [y, m, d] = dtf.format(new Date(ms)).split('-').map(Number);
  return { y, m, d };
}

function startOfDayUtcForTz(ms: number): number {
  const { y, m, d } = partsInTz(ms);
  return Date.UTC(y, m - 1, d);
}

/** Compute the bucket key + display label + bucket-start for a granularity. */
function bucketize(ms: number, g: Granularity): { key: string; label: string; start: number } {
  const { y, m, d } = partsInTz(ms);
  const dayStart = Date.UTC(y, m - 1, d);
  if (g === 'day') {
    return { key: `${y}-${m}-${d}`, label: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`, start: dayStart };
  }
  if (g === 'week') {
    // ISO-ish week: anchor to Monday.
    const dow = (new Date(dayStart).getUTCDay() + 6) % 7; // 0 = Monday
    const weekStart = dayStart - dow * 86_400_000;
    const ws = new Date(weekStart);
    return { key: `w-${weekStart}`, label: `${String(ws.getUTCDate()).padStart(2, '0')}/${String(ws.getUTCMonth() + 1).padStart(2, '0')}`, start: weekStart };
  }
  if (g === 'month') {
    return { key: `${y}-${m}`, label: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${String(y).slice(2)}`, start: Date.UTC(y, m - 1, 1) };
  }
  if (g === 'quarter') {
    const q = Math.floor((m - 1) / 3);
    return { key: `${y}-q${q}`, label: `Q${q + 1} ${String(y).slice(2)}`, start: Date.UTC(y, q * 3, 1) };
  }
  return { key: `${y}`, label: `${y}`, start: Date.UTC(y, 0, 1) };
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-[11px] text-muted-foreground">new</span>;
  }
  const up = value > 0;
  const flat = Math.abs(value) < 0.05;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat ? 'text-muted-foreground' : up ? 'text-emerald-500' : 'text-rose-500';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {flat ? '0%' : `${up ? '+' : ''}${value.toFixed(1)}%`}
    </span>
  );
}

export function EmailPeriodComparison() {
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [rows, setRows] = useState<TxLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Window large enough to cover the periods we compare, plus one for "previous".
      const ms = {
        day: 20 * 86_400_000,
        week: 16 * 7 * 86_400_000,
        month: 14 * 31 * 86_400_000,
        quarter: 10 * 92 * 86_400_000,
        year: 6 * 366 * 86_400_000,
      }[granularity];
      const sinceIso = new Date(Date.now() - ms).toISOString();
      const { data, error } = await (supabase.from('gmail_transactions') as any)
        .select('amount,direction,internal_date')
        .gte('internal_date', sinceIso)
        .order('internal_date', { ascending: false })
        .limit(20000);
      if (cancelled) return;
      if (error) { setRows([]); setLoading(false); return; }
      setRows((data ?? []) as TxLite[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [granularity]);

  const buckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>();
    for (const r of rows) {
      if (!r.internal_date) continue;
      const ms = new Date(r.internal_date).getTime();
      if (!Number.isFinite(ms)) continue;
      const { key, label, start } = bucketize(ms, granularity);
      let b = map.get(key);
      if (!b) { b = { key, label, start, in: 0, out: 0, net: 0, count: 0 }; map.set(key, b); }
      const amt = Number(r.amount) || 0;
      if (amt > 0) {
        if (r.direction === 'in') b.in += amt;
        else if (r.direction === 'out') b.out += amt;
      }
      b.count += 1;
    }
    const arr = Array.from(map.values()).sort((a, b) => a.start - b.start);
    for (const b of arr) b.net = b.in - b.out;
    return arr.slice(-GRAN[granularity].periods);
  }, [rows, granularity]);

  const curr = buckets[buckets.length - 1];
  const prev = buckets[buckets.length - 2];

  const metrics = useMemo(() => {
    if (!curr) return [];
    const p = prev ?? { in: 0, out: 0, net: 0, count: 0 };
    return [
      { label: 'Money in', curr: curr.in, prev: p.in, fmt: fmtUgx },
      { label: 'Money out', curr: curr.out, prev: p.out, fmt: fmtUgx },
      { label: 'Net', curr: curr.net, prev: p.net, fmt: fmtUgx },
      { label: 'Emails', curr: curr.count, prev: p.count, fmt: (n: number) => n.toLocaleString() },
    ];
  }, [curr, prev]);

  const chartData = useMemo(
    () => buckets.map((b) => ({ label: b.label, In: Math.round(b.in), Out: Math.round(b.out) })),
    [buckets],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            Period Comparison · {GRAN[granularity].over}
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(GRAN) as Granularity[]).map((g) => (
              <Button
                key={g}
                size="sm"
                variant={granularity === g ? 'default' : 'outline'}
                className="h-7 px-2.5 text-xs"
                onClick={() => setGranularity(g)}
              >
                {GRAN[g].label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !curr ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No email transactions in this window yet.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-[11px] text-muted-foreground -mt-1">
              Comparing <span className="font-medium text-foreground">{curr.label}</span>
              {prev ? <> vs previous <span className="font-medium text-foreground">{prev.label}</span></> : ' (no prior period)'} · timezone {TZ}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
                  <p className="mt-1 text-base font-bold tabular-nums">{m.fmt(m.curr)}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <DeltaBadge value={pctChange(m.curr, m.prev)} />
                    <span className="text-[10px] text-muted-foreground">prev {m.fmt(m.prev)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <RTooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--background))' }}
                    formatter={(v: number, n: string) => [fmtUgx(v), n]}
                  />
                  <Bar dataKey="In" fill="hsl(var(--success, 142 71% 45%))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Out" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-2 font-medium">{GRAN[granularity].label}</th>
                    <th className="py-1.5 px-2 font-medium text-right">In</th>
                    <th className="py-1.5 px-2 font-medium text-right">Out</th>
                    <th className="py-1.5 px-2 font-medium text-right">Net</th>
                    <th className="py-1.5 px-2 font-medium text-right">Emails</th>
                    <th className="py-1.5 pl-2 font-medium text-right">Net Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.slice().reverse().map((b, i, arr) => {
                    const older = arr[i + 1];
                    return (
                      <tr key={b.key} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 pr-2 font-medium">{b.label}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-emerald-500">{fmtUgx(b.in)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-rose-500">{fmtUgx(b.out)}</td>
                        <td className={`py-1.5 px-2 text-right tabular-nums ${b.net >= 0 ? 'text-foreground' : 'text-rose-500'}`}>{fmtUgx(b.net)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{b.count.toLocaleString()}</td>
                        <td className="py-1.5 pl-2 text-right">{older ? <DeltaBadge value={pctChange(b.net, older.net)} /> : <span className="text-[11px] text-muted-foreground">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
