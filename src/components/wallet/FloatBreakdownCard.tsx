import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowDownLeft, ArrowUpRight, CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Wallet } from 'lucide-react';
import { CompactAmount } from '@/components/ui/CompactAmount';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatUGX } from '@/lib/rentCalculations';
import { cn } from '@/lib/utils';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

// Categories that move money into/out of the FLOAT bucket on the wallet leg.
// Kept narrow + explicit so we never miscount commission/withdrawable entries.
const FLOAT_IN_CATEGORIES = [
  'agent_float_deposit',
  'operational_float_deposit',
  'agent_float_topup',
  'float_received',
  'partner_float_transfer_in',
] as const;

const FLOAT_OUT_CATEGORIES = [
  'rent_payment_for_tenant',
  'agent_float_used_for_rent',
  'agent_float_payout',
  'float_withdrawal',
  'landlord_payout',
  'partner_float_transfer_out',
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  agent_float_deposit: 'Deposit',
  operational_float_deposit: 'Deposit',
  agent_float_topup: 'Top-up',
  float_received: 'Received',
  partner_float_transfer_in: 'Transfer in',
  rent_payment_for_tenant: 'Rent paid',
  agent_float_used_for_rent: 'Rent paid',
  agent_float_payout: 'Payout',
  float_withdrawal: 'Withdrawal',
  landlord_payout: 'Landlord payout',
  partner_float_transfer_out: 'Transfer out',
};

interface Entry {
  id: string;
  transaction_date: string;
  category: string;
  direction: 'cash_in' | 'cash_out';
  amount: number;
  reference_id: string | null;
  description: string | null;
}

interface FloatBreakdownCardProps {
  floatBalance: number;
}

const ALL_CATS = [...FLOAT_IN_CATEGORIES, ...FLOAT_OUT_CATEGORIES];
const PAGE_SIZE = 50;

type RangePreset = 'all' | '7d' | '30d' | '90d' | 'custom';

const PRESET_LABEL: Record<RangePreset, string> = {
  all: 'All time',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  custom: 'Custom range',
};

function resolveRange(preset: RangePreset, customFrom?: Date, customTo?: Date): { from?: string; to?: string } {
  const now = new Date();
  if (preset === 'all') return {};
  if (preset === '7d') return { from: startOfDay(subDays(now, 6)).toISOString(), to: endOfDay(now).toISOString() };
  if (preset === '30d') return { from: startOfDay(subDays(now, 29)).toISOString(), to: endOfDay(now).toISOString() };
  if (preset === '90d') return { from: startOfDay(subDays(now, 89)).toISOString(), to: endOfDay(now).toISOString() };
  // custom
  return {
    from: customFrom ? startOfDay(customFrom).toISOString() : undefined,
    to: customTo ? endOfDay(customTo).toISOString() : undefined,
  };
}

function labelFor(cat: string) {
  return CATEGORY_LABEL[cat] ?? cat.replace(/_/g, ' ');
}

export function FloatBreakdownCard({ floatBalance }: FloatBreakdownCardProps) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [cumulativeIn, setCumulativeIn] = useState(0);
  const [cumulativeOut, setCumulativeOut] = useState(0);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState<RangePreset>('all');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const range = useMemo(
    () => resolveRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const fetchPage = useCallback(async (pageIndex: number) => {
    if (!user?.id) return;
    setLoading(true);

    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let rowsQ = supabase
      .from('general_ledger')
      .select('id, transaction_date, category, direction, amount, reference_id, description')
      .eq('user_id', user.id)
      .eq('ledger_scope', 'wallet')
      .in('category', ALL_CATS)
      // User-facing ledger filter (per memory)
      .neq('classification', 'admin_correction')
      .neq('category', 'system_balance_correction');
    let countQ = supabase
      .from('general_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('ledger_scope', 'wallet')
      .in('category', ALL_CATS)
      .neq('classification', 'admin_correction')
      .neq('category', 'system_balance_correction');

    if (range.from) {
      rowsQ = rowsQ.gte('transaction_date', range.from);
      countQ = countQ.gte('transaction_date', range.from);
    }
    if (range.to) {
      rowsQ = rowsQ.lte('transaction_date', range.to);
      countQ = countQ.lte('transaction_date', range.to);
    }

    const [{ data, error }, { count, error: countError }] = await Promise.all([
      rowsQ.order('transaction_date', { ascending: false }).range(from, to),
      countQ,
    ]);

    if (error) {
      console.error('[FloatBreakdownCard] load error', error);
      setEntries([]);
    } else {
      setEntries((data ?? []) as Entry[]);
    }

    if (countError) {
      console.error('[FloatBreakdownCard] count error', countError);
    } else {
      setTotalCount(count ?? 0);
    }

    setLoading(false);
  }, [user?.id, range.from, range.to]);

  useEffect(() => {
    if (!user?.id || !expanded) return;
    fetchPage(page);
  }, [user?.id, expanded, page, fetchPage]);

  // Reset pagination and cumulative reconciliation when the filter changes.
  useEffect(() => {
    setPage(0);
    setCumulativeIn(0);
    setCumulativeOut(0);
    setSeenIds(new Set());
  }, [range.from, range.to]);

  // Accumulate totals across all pages the user has visited so far.
  useEffect(() => {
    if (entries.length === 0) return;
    setSeenIds((prev) => {
      const next = new Set(prev);
      let addedIn = 0;
      let addedOut = 0;
      for (const e of entries) {
        if (!next.has(e.id)) {
          next.add(e.id);
          if (e.direction === 'cash_in') addedIn += Number(e.amount || 0);
          else addedOut += Number(e.amount || 0);
        }
      }
      if (addedIn > 0) setCumulativeIn((c) => c + addedIn);
      if (addedOut > 0) setCumulativeOut((c) => c + addedOut);
      return next;
    });
  }, [entries]);

  const totalIn = entries
    .filter((e) => e.direction === 'cash_in')
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalOut = entries
    .filter((e) => e.direction === 'cash_out')
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  const netCumulative = cumulativeIn - cumulativeOut;
  const diff = netCumulative - floatBalance;
  const isReconciled = Math.abs(diff) < 1;
  const allReviewed = seenIds.size >= totalCount && totalCount > 0;

  const canGoPrev = page > 0;
  const canGoNext = page < totalPages - 1;

  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-3 text-left"
          aria-expanded={expanded}
          aria-controls="float-breakdown-body"
        >
          <div className="h-10 w-10 rounded-2xl bg-[hsl(195,80%,45%)]/10 flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5 text-[hsl(195,80%,45%)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground">Float breakdown</p>
            <p className="text-xs text-muted-foreground">
              Float balance:{' '}
              <CompactAmount value={floatBalance} className="border-0" />
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground/60" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground/60" />
          )}
        </button>

        {expanded && (
          <div id="float-breakdown-body" className="mt-4 space-y-3">
            {/* Date-range filter */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRESET_LABEL) as RangePreset[]).map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {PRESET_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {preset === 'custom' && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-8 justify-start text-left text-xs font-normal',
                          !customFrom && 'text-muted-foreground',
                        )}
                      >
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {customFrom ? format(customFrom, 'MMM d, yyyy') : 'From'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customFrom}
                        onSelect={setCustomFrom}
                        disabled={(d) => d > new Date() || (customTo ? d > customTo : false)}
                        initialFocus
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-8 justify-start text-left text-xs font-normal',
                          !customTo && 'text-muted-foreground',
                        )}
                      >
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {customTo ? format(customTo, 'MMM d, yyyy') : 'To'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customTo}
                        onSelect={setCustomTo}
                        disabled={(d) => d > new Date() || (customFrom ? d < customFrom : false)}
                        initialFocus
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                  {(customFrom || customTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => {
                        setCustomFrom(undefined);
                        setCustomTo(undefined);
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-500/10 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold">
                  Cash in
                </p>
                <CompactAmount
                  value={totalIn}
                  className="text-emerald-700 dark:text-emerald-400 font-bold border-0 p-0"
                />
                <p className="text-[10px] text-emerald-700/60 dark:text-emerald-400/60 mt-0.5">
                  this page
                </p>
              </div>
              <div className="rounded-xl bg-rose-500/10 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-rose-700 dark:text-rose-400 font-semibold">
                  Cash out
                </p>
                <CompactAmount
                  value={totalOut}
                  className="text-rose-700 dark:text-rose-400 font-bold border-0 p-0"
                />
                <p className="text-[10px] text-rose-700/60 dark:text-rose-400/60 mt-0.5">
                  this page
                </p>
              </div>
            </div>

            {loading ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                Loading entries…
              </p>
            ) : entries.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No float entries yet.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-border/60 rounded-xl border border-border/60 overflow-hidden">
                  {entries.map((e) => {
                    const isIn = e.direction === 'cash_in';
                    return (
                      <li
                        key={e.id}
                        className="flex items-start gap-3 px-3 py-2 bg-background"
                      >
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                            isIn ? 'bg-emerald-500/10' : 'bg-rose-500/10'
                          }`}
                        >
                          {isIn ? (
                            <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-rose-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground truncate">
                              {labelFor(e.category)}
                            </p>
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 h-4 px-1.5"
                            >
                              {isIn ? 'IN' : 'OUT'}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {format(new Date(e.transaction_date), 'MMM d, yyyy · h:mm a')}
                            {e.reference_id ? ` · Ref ${e.reference_id}` : ''}
                          </p>
                          {e.description && (
                            <p className="text-[11px] text-muted-foreground/80 truncate">
                              {e.description}
                            </p>
                          )}
                        </div>
                        <CompactAmount
                          value={Number(e.amount)}
                          className={`font-semibold border-0 p-0 ${
                            isIn
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        />
                      </li>
                    );
                  })}
                </ul>

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 px-2"
                      disabled={!canGoPrev}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground font-medium">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 px-2"
                      disabled={!canGoNext}
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Reconciliation row */}
                <div
                  className={`rounded-xl border px-3 py-2.5 space-y-1 ${
                    isReconciled
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-amber-500/30 bg-amber-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-foreground">
                      Reconciliation
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] h-5 ${
                        isReconciled
                          ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                          : 'border-amber-500/40 text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {isReconciled ? 'Reconciled' : 'Mismatch'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      Cash in − Cash out
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatUGX(netCumulative)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Float balance</span>
                    <span className="font-medium tabular-nums">
                      {formatUGX(floatBalance)}
                    </span>
                  </div>
                  {!isReconciled && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Difference</span>
                      <span
                        className={`font-semibold tabular-nums ${
                          diff > 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {diff > 0 ? '+' : ''}
                        {formatUGX(diff)}
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/70 pt-0.5">
                    Based on {seenIds.size.toLocaleString()} of{' '}
                    {totalCount.toLocaleString()} entries
                    {allReviewed ? ' (all reviewed)' : ''}
                  </p>
                </div>

                <p className="text-[10px] text-muted-foreground/70 text-center">
                  Source: general ledger · wallet-side entries · {totalCount.toLocaleString()} total
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FloatBreakdownCard;