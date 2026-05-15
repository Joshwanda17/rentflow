import { useEffect, useMemo, useState } from 'react';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, subDays, subMonths, subYears } from 'date-fns';
import { Loader2, RefreshCw, Calendar, FileSpreadsheet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatDynamic as formatUGX } from '@/lib/currencyFormat';
import { CATEGORY_DESCRIPTIONS } from '@/lib/ledgerConstants';
import { downloadCsv } from '@/lib/csvExport';

// ─────────────────────────────────────────────────────────────
// Periods & granularity
// ─────────────────────────────────────────────────────────────

type PeriodKey =
  | 'today' | '7d' | '14d' | '30d' | '90d' | '120d' | '180d'
  | '1y' | 'ytd' | 'all';

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'today',  label: 'Today' },
  { value: '7d',     label: '7 Days' },
  { value: '14d',    label: '14 Days' },
  { value: '30d',    label: '30 Days' },
  { value: '90d',    label: '3 Months' },
  { value: '120d',   label: '4 Months' },
  { value: '180d',   label: '6 Months' },
  { value: '1y',     label: '1 Year' },
  { value: 'ytd',    label: 'YTD' },
  { value: 'all',    label: 'All Time' },
];

type Granularity = 'daily' | 'weekly' | 'monthly';
const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function periodRange(p: PeriodKey): { from: Date | null; to: Date } {
  const now = new Date();
  switch (p) {
    case 'today': return { from: startOfDay(now), to: now };
    case '7d':    return { from: subDays(now, 7), to: now };
    case '14d':   return { from: subDays(now, 14), to: now };
    case '30d':   return { from: subDays(now, 30), to: now };
    case '90d':   return { from: subMonths(now, 3), to: now };
    case '120d':  return { from: subMonths(now, 4), to: now };
    case '180d':  return { from: subMonths(now, 6), to: now };
    case '1y':    return { from: subYears(now, 1), to: now };
    case 'ytd':   return { from: startOfYear(now), to: now };
    case 'all':   return { from: null, to: now };
  }
}

function bucketKey(d: Date, g: Granularity): string {
  if (g === 'daily')   return format(startOfDay(d), 'yyyy-MM-dd');
  if (g === 'weekly')  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-'W'II");
  return format(startOfMonth(d), 'yyyy-MM');
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type LedgerRow = {
  transaction_date: string;
  amount: number | string;
  direction: 'cash_in' | 'cash_out';
  category: string;
  ledger_scope: 'platform' | 'wallet' | 'bridge' | string;
  classification: string | null;
};

type GroupKey = string; // `${category}|${ledger_scope}`

type Aggregate = {
  category: string;
  scope: string;
  cashIn: number;
  cashOut: number;
  net: number;
  count: number;
  buckets: Record<string, { in: number; out: number }>;
};

const SCOPE_LABEL: Record<string, string> = {
  platform: 'Platform',
  wallet:   'User Custody',
  bridge:   'Bridge',
};

const SCOPE_BADGE: Record<string, string> = {
  platform: 'bg-primary/10 text-primary border-primary/30',
  wallet:   'bg-amber-500/10 text-amber-600 border-amber-500/30',
  bridge:   'bg-purple-500/10 text-purple-600 border-purple-500/30',
};

function prettifyCategory(c: string): string {
  return c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function ComprehensiveCashMovement() {
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [includeAdjustments, setIncludeAdjustments] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'platform' | 'wallet' | 'bridge'>('all');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      const { from } = periodRange(period);
      // Page through to bypass 1000-row default limit
      const PAGE = 1000;
      let acc: LedgerRow[] = [];
      let offset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = supabase
          .from('general_ledger')
          .select('transaction_date, amount, direction, category, ledger_scope, classification')
          .order('transaction_date', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (from) q = q.gte('transaction_date', from.toISOString());
        const { data, error } = await q;
        if (error) throw error;
        const batch = (data || []) as LedgerRow[];
        acc = acc.concat(batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
        if (offset > 200_000) break; // safety cap
      }
      setRows(acc);
      setGeneratedAt(new Date());
    } catch (err: any) {
      console.error('[CashMovement] load failed', err);
      toast.error('Failed to load ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { generate(); /* eslint-disable-next-line */ }, [period]);

  // Aggregate
  const { aggregates, bucketLabels, totals } = useMemo(() => {
    const map = new Map<GroupKey, Aggregate>();
    const bucketSet = new Set<string>();
    let totIn = 0, totOut = 0;

    for (const r of rows) {
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) continue;
      if (scopeFilter !== 'all' && r.ledger_scope !== scopeFilter) continue;

      const amt = Number(r.amount) || 0;
      const key: GroupKey = `${r.category}|${r.ledger_scope}`;
      let a = map.get(key);
      if (!a) {
        a = { category: r.category, scope: r.ledger_scope, cashIn: 0, cashOut: 0, net: 0, count: 0, buckets: {} };
        map.set(key, a);
      }
      const bk = bucketKey(new Date(r.transaction_date), granularity);
      bucketSet.add(bk);
      const cell = a.buckets[bk] || { in: 0, out: 0 };
      if (r.direction === 'cash_in')  { a.cashIn  += amt; cell.in  += amt; totIn  += amt; }
      else                            { a.cashOut += amt; cell.out += amt; totOut += amt; }
      a.buckets[bk] = cell;
      a.count += 1;
      a.net = a.cashIn - a.cashOut;
    }

    const aggregates = Array.from(map.values()).sort((a, b) => (Math.abs(b.cashIn + b.cashOut) - Math.abs(a.cashIn + a.cashOut)));
    const bucketLabels = Array.from(bucketSet).sort();
    return { aggregates, bucketLabels, totals: { cashIn: totIn, cashOut: totOut, net: totIn - totOut } };
  }, [rows, granularity, includeAdjustments, scopeFilter]);

  const handleExport = () => {
    if (!aggregates.length) { toast.error('Nothing to export'); return; }
    const headers = ['Category', 'Scope', 'Description', 'Cash In', 'Cash Out', 'Net', 'Entries', ...bucketLabels.flatMap(b => [`${b} In`, `${b} Out`])];
    const data = aggregates.map(a => {
      const base = [
        prettifyCategory(a.category),
        SCOPE_LABEL[a.scope] || a.scope,
        CATEGORY_DESCRIPTIONS[a.category] || '',
        a.cashIn,
        a.cashOut,
        a.net,
        a.count,
      ];
      const cells = bucketLabels.flatMap(b => {
        const c = a.buckets[b];
        return [c?.in ?? 0, c?.out ?? 0];
      });
      return [...base, ...cells];
    });
    downloadCsv(`welile-cash-movement-${period}-${granularity}-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, data);
    toast.success('CSV downloaded');
  };

  const range = periodRange(period);
  const rangeLabel = range.from ? `${format(range.from, 'dd MMM yyyy')} → ${format(range.to, 'dd MMM yyyy')}` : `Inception → ${format(range.to, 'dd MMM yyyy')}`;

  return (
    <Card>
      <CardContent className="pt-4 pb-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold">Comprehensive Cash Movement</h3>
            <p className="text-[11px] text-muted-foreground">Every category × scope · derived live from <code>general_ledger</code></p>
          </div>
          <Badge variant="outline" className="text-[10px]">{rangeLabel}</Badge>
        </div>

        {/* Period */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          {PERIODS.map(p => (
            <Button key={p.value} size="sm" variant={period === p.value ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setPeriod(p.value)}>
              {p.label}
            </Button>
          ))}
        </div>

        {/* Granularity + filters */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[11px] text-muted-foreground mr-1">Bucket:</span>
          {GRANULARITIES.map(g => (
            <Button key={g.value} size="sm" variant={granularity === g.value ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setGranularity(g.value)}>
              {g.label}
            </Button>
          ))}
          <span className="text-[11px] text-muted-foreground ml-3 mr-1">Scope:</span>
          {(['all','platform','wallet','bridge'] as const).map(s => (
            <Button key={s} size="sm" variant={scopeFilter === s ? 'default' : 'outline'} className="text-xs h-7 capitalize" onClick={() => setScopeFilter(s)}>
              {s === 'all' ? 'All' : SCOPE_LABEL[s] || s}
            </Button>
          ))}
          <Button size="sm" variant={includeAdjustments ? 'default' : 'outline'} className="text-xs h-7 ml-3" onClick={() => setIncludeAdjustments(v => !v)}>
            {includeAdjustments ? '✓ Admin Adjustments' : 'Include Adjustments'}
          </Button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button onClick={generate} disabled={loading} size="sm" className="gap-2">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-2" disabled={!aggregates.length}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
          </Button>
          {generatedAt && (
            <span className="text-[11px] text-muted-foreground self-center ml-2">
              Generated {format(generatedAt, 'dd MMM HH:mm')} · {rows.length.toLocaleString()} ledger entries
            </span>
          )}
        </div>

        {/* Totals strip */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-success/5 p-3">
            <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><ArrowUpRight className="h-3 w-3 text-success" /> Total Cash In</div>
            <div className="font-mono font-semibold text-success">{formatUGX(totals.cashIn)}</div>
          </div>
          <div className="rounded-lg border border-border bg-destructive/5 p-3">
            <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground"><ArrowDownRight className="h-3 w-3 text-destructive" /> Total Cash Out</div>
            <div className="font-mono font-semibold text-destructive">{formatUGX(totals.cashOut)}</div>
          </div>
          <div className={cn('rounded-lg border border-border p-3', totals.net >= 0 ? 'bg-success/5' : 'bg-destructive/5')}>
            <div className="text-[10px] uppercase text-muted-foreground">Net Movement</div>
            <div className={cn('font-mono font-semibold', totals.net >= 0 ? 'text-success' : 'text-destructive')}>
              {totals.net >= 0 ? '+' : ''}{formatUGX(totals.net)}
            </div>
          </div>
        </div>

        {/* Category table */}
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading ledger…
          </div>
        ) : aggregates.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">No ledger movement in this period.</div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[34%]">Category</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Cash In</TableHead>
                  <TableHead className="text-right">Cash Out</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregates.map(a => (
                  <TableRow key={`${a.category}|${a.scope}`}>
                    <TableCell>
                      <div className="font-medium text-sm">{prettifyCategory(a.category)}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{a.category}</div>
                      {CATEGORY_DESCRIPTIONS[a.category] && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 max-w-md">{CATEGORY_DESCRIPTIONS[a.category]}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[10px]', SCOPE_BADGE[a.scope])}>
                        {SCOPE_LABEL[a.scope] || a.scope}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-success text-sm">{a.cashIn ? formatUGX(a.cashIn) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-destructive text-sm">{a.cashOut ? `(${formatUGX(a.cashOut)})` : '—'}</TableCell>
                    <TableCell className={cn('text-right font-mono text-sm font-semibold', a.net >= 0 ? 'text-success' : 'text-destructive')}>
                      {a.net >= 0 ? '+' : ''}{formatUGX(a.net)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{a.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Time-series matrix */}
        {aggregates.length > 0 && bucketLabels.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">{granularity === 'daily' ? 'Daily' : granularity === 'weekly' ? 'Weekly' : 'Monthly'} Net Movement by Category</h4>
            <p className="text-[11px] text-muted-foreground">Net = Cash In − Cash Out for each bucket</p>
            <div className="border border-border rounded-lg overflow-auto max-h-[480px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[200px] sticky left-0 bg-background z-20">Category · Scope</TableHead>
                    {bucketLabels.map(b => (
                      <TableHead key={b} className="text-right whitespace-nowrap text-[10px]">{b}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregates.map(a => (
                    <TableRow key={`ts-${a.category}|${a.scope}`}>
                      <TableCell className="sticky left-0 bg-background z-10">
                        <div className="text-xs font-medium">{prettifyCategory(a.category)}</div>
                        <div className="text-[10px] text-muted-foreground">{SCOPE_LABEL[a.scope] || a.scope}</div>
                      </TableCell>
                      {bucketLabels.map(b => {
                        const c = a.buckets[b];
                        const net = (c?.in || 0) - (c?.out || 0);
                        if (!c || (c.in === 0 && c.out === 0)) return <TableCell key={b} className="text-right text-muted-foreground/40 text-xs">·</TableCell>;
                        return (
                          <TableCell key={b} className={cn('text-right font-mono text-[11px] whitespace-nowrap', net >= 0 ? 'text-success' : 'text-destructive')}>
                            {net >= 0 ? '+' : ''}{formatUGX(net)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
