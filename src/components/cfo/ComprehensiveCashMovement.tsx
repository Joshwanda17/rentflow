import { useEffect, useMemo, useState } from 'react';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, subDays, subMonths, subYears } from 'date-fns';
import { Loader2, RefreshCw, Calendar, FileSpreadsheet, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatDynamic as formatUGX } from '@/lib/currencyFormat';
import { CATEGORY_DESCRIPTIONS } from '@/lib/ledgerConstants';
import { downloadCsv } from '@/lib/csvExport';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  id?: string;
  transaction_date: string;
  amount: number | string;
  direction: 'cash_in' | 'cash_out';
  category: string;
  ledger_scope: 'platform' | 'wallet' | 'bridge' | string;
  classification: string | null;
  reference_id?: string | null;
  description?: string | null;
  linked_party?: string | null;
  user_id?: string | null;
  transaction_group_id?: string | null;
  source_table?: string | null;
  source_id?: string | null;
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
  const [drill, setDrill] = useState<null | { category: string; scope: string; bucket: string | null }>(null);
  const [partyNames, setPartyNames] = useState<Record<string, string>>({});

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
          .select('id, transaction_date, amount, direction, category, ledger_scope, classification, reference_id, description, linked_party, user_id, transaction_group_id, source_table, source_id')
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

  // Drill-down filtered rows
  const drillRows = useMemo(() => {
    if (!drill) return [] as LedgerRow[];
    return rows.filter(r => {
      if (!includeAdjustments && (r.classification === 'admin_correction' || r.category === 'system_balance_correction')) return false;
      if (r.category !== drill.category || r.ledger_scope !== drill.scope) return false;
      if (drill.bucket) {
        const bk = bucketKey(new Date(r.transaction_date), granularity);
        if (bk !== drill.bucket) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
  }, [rows, drill, includeAdjustments, granularity]);

  // Resolve user names for drill-down list
  useEffect(() => {
    const ids = Array.from(new Set(drillRows.map(r => r.user_id).filter((x): x is string => !!x && !partyNames[x])));
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, phone').in('id', ids.slice(0, 200));
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      for (const p of data as any[]) {
        next[p.id] = p.full_name || p.phone || p.id.slice(0, 8);
      }
      setPartyNames(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [drillRows, partyNames]);

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

  const handleExportPdf = () => {
    if (!aggregates.length) { toast.error('Nothing to export'); return; }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const periodLabel = PERIODS.find(p => p.value === period)?.label || period;
    const granLabel = GRANULARITIES.find(g => g.value === granularity)?.label || granularity;

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Welile · Comprehensive Cash Movement', 40, 36);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${periodLabel}  ·  Bucket: ${granLabel}  ·  Scope: ${scopeFilter === 'all' ? 'All' : (SCOPE_LABEL[scopeFilter] || scopeFilter)}  ·  Adjustments: ${includeAdjustments ? 'Included' : 'Excluded'}`, 40, 52);
    doc.text(rangeLabel, 40, 66);
    doc.text(`Generated ${format(new Date(), 'dd MMM yyyy HH:mm')}  ·  ${rows.length.toLocaleString()} ledger entries`, 40, 80);

    // Totals strip
    autoTable(doc, {
      startY: 92,
      head: [['Total Cash In', 'Total Cash Out', 'Net Movement']],
      body: [[formatUGX(totals.cashIn), `(${formatUGX(totals.cashOut)})`, `${totals.net >= 0 ? '+' : ''}${formatUGX(totals.net)}`]],
      theme: 'grid',
      styles: { fontSize: 10, halign: 'right' },
      headStyles: { fillColor: [30, 30, 30], halign: 'right' },
      margin: { left: 40, right: 40 },
    });

    // Category breakdown
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 16,
      head: [['Category', 'Scope', 'Cash In', 'Cash Out', 'Net', 'Entries']],
      body: aggregates.map(a => [
        prettifyCategory(a.category),
        SCOPE_LABEL[a.scope] || a.scope,
        a.cashIn ? formatUGX(a.cashIn) : '—',
        a.cashOut ? `(${formatUGX(a.cashOut)})` : '—',
        `${a.net >= 0 ? '+' : ''}${formatUGX(a.net)}`,
        String(a.count),
      ]),
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 30] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      margin: { left: 40, right: 40 },
    });

    // Time-series net matrix (chunked across pages if many buckets)
    if (bucketLabels.length > 0) {
      const CHUNK = 12;
      for (let i = 0; i < bucketLabels.length; i += CHUNK) {
        const slice = bucketLabels.slice(i, i + CHUNK);
        doc.addPage();
        doc.setFontSize(11); doc.setFont('helvetica', 'bold');
        doc.text(`${granLabel} Net Movement by Category  (${i + 1}–${Math.min(i + CHUNK, bucketLabels.length)} of ${bucketLabels.length})`, 40, 36);
        autoTable(doc, {
          startY: 48,
          head: [['Category · Scope', ...slice]],
          body: aggregates.map(a => [
            `${prettifyCategory(a.category)} · ${SCOPE_LABEL[a.scope] || a.scope}`,
            ...slice.map(b => {
              const c = a.buckets[b];
              if (!c || (c.in === 0 && c.out === 0)) return '·';
              const net = (c.in || 0) - (c.out || 0);
              return `${net >= 0 ? '+' : ''}${formatUGX(net)}`;
            }),
          ]),
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 3 },
          headStyles: { fillColor: [30, 30, 30], fontSize: 7 },
          columnStyles: Object.fromEntries(slice.map((_, k) => [k + 1, { halign: 'right' }])) as any,
          margin: { left: 40, right: 40 },
        });
      }
    }

    // Footer page numbers
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`Welile Cash Movement · Page ${p} / ${pageCount}`, pageW - 40, doc.internal.pageSize.getHeight() - 16, { align: 'right' });
    }

    doc.save(`welile-cash-movement-${period}-${granularity}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('PDF downloaded');
  };

  const handleExportDrill = () => {
    if (!drill || drillRows.length === 0) return;
    const headers = ['Date', 'Reference ID', 'Transaction Group', 'Direction', 'Amount', 'Linked Party', 'User ID', 'User Name', 'Source Table', 'Source ID', 'Classification', 'Description'];
    const data = drillRows.map(r => [
      format(new Date(r.transaction_date), 'yyyy-MM-dd HH:mm:ss'),
      r.reference_id || '',
      r.transaction_group_id || '',
      r.direction,
      Number(r.amount) || 0,
      r.linked_party || '',
      r.user_id || '',
      (r.user_id && partyNames[r.user_id]) || '',
      r.source_table || '',
      r.source_id || '',
      r.classification || '',
      (r.description || '').replace(/\s+/g, ' ').slice(0, 500),
    ]);
    const tag = `${drill.category}_${drill.scope}${drill.bucket ? '_' + drill.bucket : ''}`;
    downloadCsv(`welile-ledger-${tag}-${format(new Date(), 'yyyy-MM-dd')}.csv`, headers, data);
    toast.success('Ledger entries exported');
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
          <Button onClick={handleExportPdf} variant="outline" size="sm" className="gap-2" disabled={!aggregates.length}>
            <FileText className="h-3.5 w-3.5" /> Export PDF
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
                  <TableRow
                    key={`${a.category}|${a.scope}`}
                    className="cursor-pointer hover:bg-muted/60"
                    onClick={() => setDrill({ category: a.category, scope: a.scope, bucket: null })}
                  >
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
                      <TableCell
                        className="sticky left-0 bg-background z-10 cursor-pointer hover:text-primary"
                        onClick={() => setDrill({ category: a.category, scope: a.scope, bucket: null })}
                      >
                        <div className="text-xs font-medium">{prettifyCategory(a.category)}</div>
                        <div className="text-[10px] text-muted-foreground">{SCOPE_LABEL[a.scope] || a.scope}</div>
                      </TableCell>
                      {bucketLabels.map(b => {
                        const c = a.buckets[b];
                        const net = (c?.in || 0) - (c?.out || 0);
                        if (!c || (c.in === 0 && c.out === 0)) return <TableCell key={b} className="text-right text-muted-foreground/40 text-xs">·</TableCell>;
                        return (
                          <TableCell
                            key={b}
                            onClick={() => setDrill({ category: a.category, scope: a.scope, bucket: b })}
                            className={cn('text-right font-mono text-[11px] whitespace-nowrap cursor-pointer hover:bg-primary/10 hover:underline', net >= 0 ? 'text-success' : 'text-destructive')}
                          >
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

        {/* Drill-down sheet */}
        <Sheet open={!!drill} onOpenChange={(o) => { if (!o) setDrill(null); }}>
          <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
            {drill && (
              <>
                <SheetHeader className="space-y-1">
                  <SheetTitle className="text-base flex items-center gap-2">
                    {prettifyCategory(drill.category)}
                    <Badge variant="outline" className={cn('text-[10px]', SCOPE_BADGE[drill.scope])}>
                      {SCOPE_LABEL[drill.scope] || drill.scope}
                    </Badge>
                    {drill.bucket && <Badge variant="secondary" className="text-[10px]">{drill.bucket}</Badge>}
                  </SheetTitle>
                  <SheetDescription className="text-xs">
                    {CATEGORY_DESCRIPTIONS[drill.category] || 'Raw ledger entries for this category × scope.'}
                  </SheetDescription>
                </SheetHeader>

                {/* Summary */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {(() => {
                    const cIn  = drillRows.filter(r => r.direction === 'cash_in').reduce((s, r) => s + (Number(r.amount) || 0), 0);
                    const cOut = drillRows.filter(r => r.direction === 'cash_out').reduce((s, r) => s + (Number(r.amount) || 0), 0);
                    const net  = cIn - cOut;
                    return (
                      <>
                        <div className="rounded border border-border bg-success/5 p-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Cash In</div>
                          <div className="font-mono text-success text-sm font-semibold">{formatUGX(cIn)}</div>
                        </div>
                        <div className="rounded border border-border bg-destructive/5 p-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Cash Out</div>
                          <div className="font-mono text-destructive text-sm font-semibold">{formatUGX(cOut)}</div>
                        </div>
                        <div className={cn('rounded border border-border p-2', net >= 0 ? 'bg-success/5' : 'bg-destructive/5')}>
                          <div className="text-[10px] uppercase text-muted-foreground">Net</div>
                          <div className={cn('font-mono text-sm font-semibold', net >= 0 ? 'text-success' : 'text-destructive')}>
                            {net >= 0 ? '+' : ''}{formatUGX(net)}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="flex items-center justify-between mt-4 mb-2">
                  <div className="text-[11px] text-muted-foreground">
                    {drillRows.length.toLocaleString()} ledger entr{drillRows.length === 1 ? 'y' : 'ies'}
                  </div>
                  <Button size="sm" variant="outline" className="gap-2 text-xs h-7" onClick={handleExportDrill} disabled={drillRows.length === 0}>
                    <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
                  </Button>
                </div>

                {drillRows.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">No ledger entries.</div>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Reference / Tx</TableHead>
                          <TableHead className="text-xs">Party</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drillRows.slice(0, 500).map((r, i) => {
                          const amt = Number(r.amount) || 0;
                          const isIn = r.direction === 'cash_in';
                          const name = r.user_id ? partyNames[r.user_id] : null;
                          return (
                            <TableRow key={r.id || `${r.reference_id}-${i}`}>
                              <TableCell className="text-[11px] whitespace-nowrap align-top">
                                <div>{format(new Date(r.transaction_date), 'dd MMM yyyy')}</div>
                                <div className="text-muted-foreground">{format(new Date(r.transaction_date), 'HH:mm:ss')}</div>
                              </TableCell>
                              <TableCell className="text-[11px] align-top">
                                <div className="font-mono">{r.reference_id || '—'}</div>
                                {r.transaction_group_id && (
                                  <div className="text-[10px] text-muted-foreground font-mono">grp: {r.transaction_group_id.slice(0, 8)}…</div>
                                )}
                                {r.source_table && (
                                  <div className="text-[10px] text-muted-foreground">{r.source_table}{r.source_id ? `:${r.source_id.slice(0, 6)}…` : ''}</div>
                                )}
                                {r.description && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 max-w-[260px]">{r.description}</div>
                                )}
                                {r.classification && r.classification !== 'production' && (
                                  <Badge variant="outline" className="text-[9px] mt-0.5">{r.classification}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-[11px] align-top">
                                <div>{name || (r.linked_party ? prettifyCategory(r.linked_party) : '—')}</div>
                                {r.user_id && (
                                  <div className="text-[10px] text-muted-foreground font-mono">{r.user_id.slice(0, 8)}…</div>
                                )}
                              </TableCell>
                              <TableCell className={cn('text-right font-mono text-xs whitespace-nowrap align-top font-semibold', isIn ? 'text-success' : 'text-destructive')}>
                                {isIn ? '+' : '−'}{formatUGX(amt)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {drillRows.length > 500 && (
                      <div className="text-[10px] text-muted-foreground text-center py-2 border-t border-border">
                        Showing first 500 of {drillRows.length.toLocaleString()}. Export CSV for full list.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}
