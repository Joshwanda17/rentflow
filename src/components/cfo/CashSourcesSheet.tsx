import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';

export interface CashSourceLine {
  category: string;
  label: string;
  value: number;
  count?: number;
  /** Underlying ledger categories that net into this source. */
  children?: { category: string; label: string; value: number; count?: number }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalCash: number;
  a1: number;
  a5: number;
  increases: CashSourceLine[];
  decreases: CashSourceLine[];
}

interface TxRow {
  id: string;
  transaction_date: string;
  reference: string;
  description: string;
  amount: number;
  direction: 'in' | 'out';
  status: string;
  linked_party: string;
  account_code: string;
}

const PAGE = 50;

function useSourceTransactions(category: string | null, page: number) {
  return useQuery({
    queryKey: ['cfo-cash-source-transactions', category, page],
    enabled: !!category,
    queryFn: async () => {
      // Recorded partner funding drills into the portfolio records themselves —
      // the same rows the Partnership Dashboard reports from.
      if (category === 'partner_capital_recorded') {
        const { data, count, error } = await supabase
          .from('investor_portfolios')
          .select(
            'id, portfolio_code, account_name, investment_amount, status, created_at, payment_method',
            { count: 'exact' }
          )
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        const rows: TxRow[] = ((data as any[]) || []).map((p) => ({
          id: p.id,
          transaction_date: p.created_at,
          reference: p.portfolio_code || '—',
          description: 'Recorded partner funding',
          amount: Number(p.investment_amount || 0),
          direction: 'in',
          status: p.status,
          linked_party: p.account_name || '—',
          account_code: p.payment_method || 'portfolio',
        }));
        return { rows, totalCount: Number(count ?? rows.length), netAmount: 0 };
      }

      const { data, error } = await supabase.rpc('get_treasury_cash_transactions' as any, {
        p_category: category,
        p_limit: PAGE,
        p_offset: page * PAGE,
      } as any);
      if (error) throw error;
      const res = data as any;
      return {
        rows: (res?.rows ?? []) as TxRow[],
        totalCount: Number(res?.total_count ?? 0),
        netAmount: Number(res?.net_amount ?? 0),
      };
    },
    staleTime: 120_000,
  });
}

export function CashSourcesSheet({ open, onOpenChange, totalCash, a1, a5, increases, decreases }: Props) {
  const [selected, setSelected] = useState<CashSourceLine | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { data, isLoading, error } = useSourceTransactions(selected?.category ?? null, page);

  const grossIn = increases.reduce((s, i) => s + i.value, 0);
  const grossOut = decreases.reduce((s, i) => s + i.value, 0);

  const pick = (line: CashSourceLine) => {
    setSelected(line);
    setPage(0);
  };

  const openLine = (line: CashSourceLine) => {
    if (line.children && line.children.length > 1) {
      setExpanded((cur) => (cur === line.category ? null : line.category));
      return;
    }
    const only = line.children?.[0];
    pick(only ? { ...only, value: Math.abs(only.value) } : line);
  };

  const close = (o: boolean) => {
    if (!o) {
      setSelected(null);
      setExpanded(null);
      setPage(0);
    }
    onOpenChange(o);
  };

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[88vh] overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base flex items-center gap-2">
            {selected && (
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {selected ? `${selected.label} — transactions` : 'Money We Have → Sources of Money'}
          </SheetTitle>
        </SheetHeader>

        {!selected && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Where did the money we have come from?</p>
              <p className="text-2xl font-bold font-mono mt-1">{formatUGX(totalCash)}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Bank &amp; cash (A1) {formatUGX(a1)} · In transit (A5) {formatUGX(a5)}. Each source below is the net of its own
                cash legs, counted once, so money in minus money out equals this figure exactly. Tap a source to see the
                underlying entries.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sources of money in</span>
                <span className="text-xs font-mono font-bold text-emerald-600">{formatUGX(grossIn)}</span>
              </div>
              <div className="space-y-2">
                {increases.map((line) => {
                  const pct = grossIn > 0 ? (line.value / grossIn) * 100 : 0;
                  const pctOfTotal = totalCash > 0 ? (line.value / totalCash) * 100 : 0;
                  return (
                    <div key={line.category} className="rounded-xl border border-border">
                    <button
                      onClick={() => openLine(line)}
                      className="w-full text-left p-3 hover:bg-muted/60 transition-colors rounded-xl"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{line.label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {pct.toFixed(1)}% of money in · {pctOfTotal.toFixed(1)}% of Money We Have
                            {line.count != null ? ` · ${line.count} entries` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-sm font-semibold text-emerald-600">{formatUGX(line.value)}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <Progress value={Math.min(100, pct)} className="h-1.5 mt-2" />
                    </button>
                    {expanded === line.category && (
                      <div className="border-t border-border divide-y divide-border">
                        {(line.children ?? []).map((c) => (
                          <button
                            key={c.category}
                            onClick={() => pick({ ...c, value: Math.abs(c.value) })}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/60"
                          >
                            <span className="text-muted-foreground truncate">
                              {c.label}
                              {c.count != null ? ` (${c.count})` : ''}
                            </span>
                            <span className="flex items-center gap-2 shrink-0">
                              <span className={`font-mono ${c.value < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                                {c.value < 0 ? '−' : '+'}
                                {formatUGX(Math.abs(c.value))}
                              </span>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
                  );
                })}
                {increases.length === 0 && <p className="text-sm text-muted-foreground">No cash inflows recorded.</p>}
              </div>
            </div>

            {decreases.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Money that left again</span>
                  <span className="text-xs font-mono font-bold text-destructive">−{formatUGX(grossOut)}</span>
                </div>
                <div className="space-y-1">
                  {decreases.map((line) => (
                    <div key={line.category}>
                    <button
                      onClick={() => openLine(line)}
                      className="w-full flex items-center justify-between gap-2 py-2 px-1 text-sm hover:bg-muted/60 rounded-lg"
                    >
                      <span className="text-muted-foreground truncate">
                        {line.label}
                        {line.count != null ? ` (${line.count})` : ''}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-destructive">−{formatUGX(line.value)}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </button>
                    {expanded === line.category && (
                      <div className="pl-3 pb-1">
                        {(line.children ?? []).map((c) => (
                          <button
                            key={c.category}
                            onClick={() => pick({ ...c, value: Math.abs(c.value) })}
                            className="w-full flex items-center justify-between gap-2 px-1 py-1.5 text-xs hover:bg-muted/60 rounded-md"
                          >
                            <span className="text-muted-foreground truncate">
                              {c.label}
                              {c.count != null ? ` (${c.count})` : ''}
                            </span>
                            <span className={`font-mono ${c.value < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                              {c.value < 0 ? '−' : '+'}
                              {formatUGX(Math.abs(c.value))}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-1 pb-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Money in</span>
                <span className="font-mono">{formatUGX(grossIn)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Money out</span>
                <span className="font-mono text-destructive">−{formatUGX(grossOut)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <span className="text-sm font-bold">Money We Have</span>
                <span className="text-lg font-bold font-mono">{formatUGX(grossIn - grossOut)}</span>
              </div>
              {Math.abs(grossIn - grossOut - totalCash) > 1 && (
                <p className="text-[11px] text-amber-600">
                  Reconciliation gap vs Balance Sheet cash: {formatUGX(totalCash - (grossIn - grossOut))}
                </p>
              )}
            </div>
          </div>
        )}

        {selected && (
          <div className="space-y-3 pb-4">
            <div className="rounded-xl border border-border bg-muted/40 p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Net effect on cash</p>
                <p className="text-lg font-bold font-mono">{formatUGX(data?.netAmount ?? selected.value)}</p>
              </div>
              <p className="text-[11px] text-muted-foreground">{data?.totalCount ?? selected.count ?? 0} transactions</p>
            </div>

            {isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{(error as any)?.message || 'Could not load transactions'}</p>}

            {!isLoading &&
              (data?.rows ?? []).map((row) => (
                <div key={row.id} className="rounded-xl border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.transaction_date).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    <span className={`font-mono text-sm font-semibold ${row.direction === 'in' ? 'text-emerald-600' : 'text-destructive'}`}>
                      {row.direction === 'in' ? '' : '−'}
                      {formatUGX(Math.abs(row.amount))}
                    </span>
                  </div>
                  <p className="text-sm">{row.description || '—'}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      Ref {row.reference ? row.reference.slice(0, 18) : row.id.slice(0, 8)}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {row.status.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {row.account_code === 'A1' ? 'Bank & cash' : 'In transit'}
                    </Badge>
                    {row.linked_party && <span className="text-[11px] text-muted-foreground">{row.linked_party}</span>}
                  </div>
                </div>
              ))}

            {!isLoading && (data?.rows.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No transactions found for this source.</p>
            )}

            {(data?.totalCount ?? 0) > PAGE && (
              <div className="flex items-center justify-between pt-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {Math.ceil((data?.totalCount ?? 1) / PAGE)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(page + 1) * PAGE >= (data?.totalCount ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
