import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Loader2, FileSpreadsheet, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { exportToCSV } from '@/lib/exportUtils';
import { formatDynamic as formatUGX } from '@/lib/currencyFormat';
import type { DrillSpec } from './financialStatementsDrillMap';

interface Row {
  id: string;
  transaction_date: string;
  amount: number;
  direction: string;
  category: string;
  ledger_scope: string;
  description: string | null;
  user_id: string | null;
  linked_party: string | null;
  source_table: string | null;
  source_id: string | null;
  classification: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  spec: DrillSpec | null;
  startDate: Date | null;
  endDate: Date | null;
  periodLabel?: string;
}

const PAGE = 2000;

export function LedgerDrillDownDialog({ open, onOpenChange, title, spec, startDate, endDate, periodLabel }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!open || !spec) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        let q = supabase
          .from('general_ledger')
          .select('id, transaction_date, amount, direction, category, ledger_scope, description, user_id, linked_party, source_table, source_id, classification')
          .in('category', spec.categories)
          .in('classification', ['production', 'legacy_real'])
          .order('transaction_date', { ascending: false })
          .limit(PAGE);

        if (spec.scope) q = q.eq('ledger_scope', spec.scope);
        if (spec.direction) q = q.eq('direction', spec.direction);
        if (startDate) q = q.gte('transaction_date', startDate.toISOString());
        if (endDate) q = q.lte('transaction_date', endDate.toISOString());

        const { data, error } = await q;
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setRows([]);
        } else {
          setRows((data as any) ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, spec, startDate, endDate]);

  const uniqueCategories = useMemo(() =>
    Array.from(new Set(rows.map(r => r.category))).sort(),
    [rows]
  );

  useEffect(() => {
    setSelectedCategories(new Set(uniqueCategories));
  }, [uniqueCategories.join(',')]);

  const visibleRows = useMemo(() =>
    rows.filter(r => selectedCategories.has(r.category)),
    [rows, selectedCategories]
  );

  const total = visibleRows.reduce((s, r) => s + Number(r.amount || 0), 0);

  // Debit/Credit breakdown (accounting convention):
  //  - cash_in  → Debit  (asset/expense increase, or contra-revenue)
  //  - cash_out → Credit (revenue/liability increase, or asset decrease)
  // We surface both perspectives: raw direction sums AND per-category breakdown.
  const debitTotal = rows
    .filter(r => r.direction === 'cash_in')
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const creditTotal = rows
    .filter(r => r.direction === 'cash_out')
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const netTotal = debitTotal - creditTotal;

  const byCategory = rows.reduce<Record<string, { debit: number; credit: number; count: number }>>((acc, r) => {
    const key = r.category;
    if (!acc[key]) acc[key] = { debit: 0, credit: 0, count: 0 };
    if (r.direction === 'cash_in') acc[key].debit += Number(r.amount || 0);
    else acc[key].credit += Number(r.amount || 0);
    acc[key].count += 1;
    return acc;
  }, {});
  const categoryBreakdown = Object.entries(byCategory).sort(
    ([, a], [, b]) => (b.debit + b.credit) - (a.debit + a.credit)
  );

  const onCsv = () => {
    const headers = ['Date', 'Scope', 'Direction', 'Category', 'Amount', 'User', 'Linked Party', 'Source', 'Description'];
    const out = rows.map(r => [
      format(new Date(r.transaction_date), 'yyyy-MM-dd HH:mm'),
      r.ledger_scope, r.direction, r.category, Number(r.amount || 0),
      r.user_id ?? '', r.linked_party ?? '', `${r.source_table ?? ''}:${r.source_id ?? ''}`, r.description ?? '',
    ]);
    exportToCSV({ headers, rows: out }, `welile-drill-${title.replace(/\W+/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{title}</span>
            {periodLabel && <Badge variant="outline" className="text-xs">{periodLabel}</Badge>}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2 text-xs">
            <span>Categories:</span>
            {spec?.categories.map(c => <Badge key={c} variant="secondary" className="font-mono text-[10px]">{c}</Badge>)}
            {spec?.scope && <Badge variant="outline" className="text-[10px]">scope: {spec.scope}</Badge>}
            {spec?.direction && <Badge variant="outline" className="text-[10px]">{spec.direction}</Badge>}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-y py-2 text-xs">
          <div>
            <span className="text-muted-foreground">Rows:</span> <span className="font-semibold">{rows.length}{rows.length === PAGE ? '+' : ''}</span>
            <span className="mx-3 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Total:</span> <span className="font-mono font-semibold">{formatUGX(total)}</span>
          </div>
          <Button size="sm" variant="outline" onClick={onCsv} disabled={rows.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        </div>

        {!loading && !error && rows.length > 0 && (
          <div className="border-b bg-muted/20">
            <div className="grid grid-cols-3 gap-3 p-3 text-xs">
              <div className="rounded-md border bg-background p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Debit (cash_in)</div>
                <div className="font-mono font-semibold text-success">{formatUGX(debitTotal)}</div>
              </div>
              <div className="rounded-md border bg-background p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Credit (cash_out)</div>
                <div className="font-mono font-semibold text-destructive">{formatUGX(creditTotal)}</div>
              </div>
              <div className="rounded-md border bg-background p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Net (DR − CR)</div>
                <div className={`font-mono font-semibold ${netTotal >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {netTotal >= 0 ? '+' : '−'}{formatUGX(Math.abs(netTotal))}
                </div>
              </div>
            </div>

            <details className="px-3 pb-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                Per-category breakdown ({categoryBreakdown.length})
              </summary>
              <table className="w-full mt-2 text-[11px]">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1 pr-2 font-medium">Category</th>
                    <th className="py-1 pr-2 font-medium text-right">Count</th>
                    <th className="py-1 pr-2 font-medium text-right">Debit</th>
                    <th className="py-1 pr-2 font-medium text-right">Credit</th>
                    <th className="py-1 pr-2 font-medium text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryBreakdown.map(([cat, v]) => {
                    const net = v.debit - v.credit;
                    return (
                      <tr key={cat} className="border-b last:border-b-0">
                        <td className="py-1 pr-2 font-mono">{cat}</td>
                        <td className="py-1 pr-2 text-right">{v.count}</td>
                        <td className="py-1 pr-2 text-right font-mono text-success">{v.debit ? formatUGX(v.debit) : '—'}</td>
                        <td className="py-1 pr-2 text-right font-mono text-destructive">{v.credit ? formatUGX(v.credit) : '—'}</td>
                        <td className={`py-1 pr-2 text-right font-mono ${net >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {net >= 0 ? '+' : '−'}{formatUGX(Math.abs(net))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading ledger rows…
            </div>
          )}
          {error && <div className="p-4 text-sm text-destructive">Error: {error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">No ledger rows for this line item in the selected period.</div>
          )}
          {!loading && rows.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background border-b">
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Date</th>
                  <th className="py-2 pr-2 font-medium">Scope</th>
                  <th className="py-2 pr-2 font-medium">Category</th>
                  <th className="py-2 pr-2 font-medium text-right">Amount</th>
                  <th className="py-2 pr-2 font-medium">User</th>
                  <th className="py-2 pr-2 font-medium">Source</th>
                  <th className="py-2 pr-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="py-1.5 pr-2 whitespace-nowrap font-mono text-[11px]">
                      {format(new Date(r.transaction_date), 'MMM d HH:mm')}
                    </td>
                    <td className="py-1.5 pr-2">
                      <Badge variant="outline" className="text-[10px]">{r.ledger_scope}</Badge>
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-[11px]">{r.category}</td>
                    <td className={`py-1.5 pr-2 text-right font-mono ${r.direction === 'cash_in' ? 'text-success' : 'text-destructive'}`}>
                      {r.direction === 'cash_in' ? '+' : '-'}{formatUGX(Number(r.amount))}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-[10px] text-muted-foreground">{r.user_id?.slice(0, 8) ?? '—'}</td>
                    <td className="py-1.5 pr-2 font-mono text-[10px] text-muted-foreground">{r.source_table ?? '—'}</td>
                    <td className="py-1.5 pr-2 text-muted-foreground max-w-[280px] truncate" title={r.description ?? ''}>
                      {r.description ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
