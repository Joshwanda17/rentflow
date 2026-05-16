import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, FileSpreadsheet } from 'lucide-react';
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

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

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
