import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search, Wallet, Lock, ChevronRight, ChevronDown, X, ArrowRightLeft, Banknote } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { WalletBucketLedgerDetail } from './WalletBucketLedgerDetail';

type FocusBucket = 'float' | 'withdrawable' | null;

/**
 * Read-only wallet breakdown for managers / Fin Ops. Lists every wallet
 * with the cached balance buckets, joined to the owner's name + phone.
 *
 * Filters:
 *   - Free-text search across full name / phone (case-insensitive)
 *   - Min / Max total balance range (UGX)
 *   - Optional bucket focus (Operations Float / Withdrawable) driven by the
 *     drilldown tiles on the wallet overview card
 *
 * No mutation hooks, no buttons. Pure observability.
 */
export function WalletBreakdownReadOnly({
  focusBucket = null,
  onClearFocus,
}: {
  focusBucket?: FocusBucket;
  onClearFocus?: () => void;
} = {}) {
  const [search, setSearch] = useState('');
  const [minBal, setMinBal] = useState<string>('');
  const [maxBal, setMaxBal] = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // When a bucket drilldown is requested, scroll the table into view so the
  // operator immediately lands on the focused breakdown.
  useEffect(() => {
    if (focusBucket && rootRef.current) {
      rootRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focusBucket]);

  const { data, isLoading } = useQuery({
    queryKey: ['manager-wallet-breakdown'],
    queryFn: async () => {
      // Pull wallets with balance > 0 first (top 1000 by balance desc).
      const { data: rows, error } = await supabase
        .from('wallets')
        .select('user_id, balance, withdrawable_balance, float_balance, advance_balance, locked_balance')
        .gt('balance', 0)
        .order('balance', { ascending: false })
        .limit(1000);
      if (error) throw error;

      const userIds = (rows ?? []).map((r) => r.user_id).filter((id): id is string => !!id);
      if (userIds.length === 0) return [];

      // Use the ops-scoped RPC so Fin Ops / manager roles can read names & phones
      // even when direct SELECT on public.profiles is blocked by RLS.
      const { data: profiles } = await supabase.rpc('ops_get_profiles_lite', {
        p_ids: userIds,
      });

      const pmap = new Map(
        ((profiles ?? []) as Array<{ id: string; full_name: string | null; phone: string | null }>).map(
          (p) => [p.id, p],
        ),
      );

      return (rows ?? []).map((r) => {
        const p = r.user_id ? pmap.get(r.user_id) : undefined;
        return {
          user_id: r.user_id ?? '',
          full_name: p?.full_name ?? 'Unknown',
          phone: p?.phone ?? '',
          balance: Number(r.balance ?? 0),
          withdrawable: Number(r.withdrawable_balance ?? 0),
          float: Number(r.float_balance ?? 0),
          advance: Number(r.advance_balance ?? 0),
          locked: Number(r.locked_balance ?? 0),
        };
      });
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const min = minBal ? Number(minBal) : null;
    const max = maxBal ? Number(maxBal) : null;
    const rows = data.filter((row) => {
      if (q) {
        const hay = `${row.full_name} ${row.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (min !== null && row.balance < min) return false;
      if (max !== null && row.balance > max) return false;
      // Bucket focus: only show wallets actually holding that bucket.
      if (focusBucket === 'float' && row.float <= 0) return false;
      if (focusBucket === 'withdrawable' && row.withdrawable <= 0) return false;
      return true;
    });
    // When focused on a bucket, sort by that bucket descending so the
    // biggest holders surface first.
    if (focusBucket === 'float') {
      rows.sort((a, b) => b.float - a.float);
    } else if (focusBucket === 'withdrawable') {
      rows.sort((a, b) => b.withdrawable - a.withdrawable);
    }
    return rows;
  }, [data, search, minBal, maxBal, focusBucket]);

  const totalShown = filtered.reduce((s, r) => s + r.balance, 0);
  const focusTotal = filtered.reduce(
    (s, r) => s + (focusBucket === 'float' ? r.float : focusBucket === 'withdrawable' ? r.withdrawable : 0),
    0,
  );
  const focusLabel = focusBucket === 'float' ? 'Operations Float' : focusBucket === 'withdrawable' ? 'Withdrawable' : '';

  return (
    <div ref={rootRef} className="space-y-5 scroll-mt-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5">
          <Wallet className="h-6 w-6 text-primary" />
          Wallet Breakdown
          <span className="inline-flex items-center gap-1 rounded-full border border-muted bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Lock className="h-3 w-3" /> Read-only
          </span>
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Search every wallet by name, phone, or balance range. View only — no actions.
        </p>
      </div>

      {/* Active bucket focus banner */}
      {focusBucket && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {focusBucket === 'float' ? (
              <ArrowRightLeft className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <Banknote className="h-4 w-4 text-primary shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                Drilldown: {focusLabel}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {filtered.length.toLocaleString()} wallets • {formatUGX(focusTotal)} total
              </p>
            </div>
          </div>
          {onClearFocus && (
            <button
              type="button"
              onClick={onClearFocus}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-border bg-card p-4">
        <div className="sm:col-span-3">
          <Label htmlFor="wb-search" className="text-xs">Search by name or phone</Label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="wb-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a name or phone…"
              className="pl-9"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="wb-min" className="text-xs">Min balance (UGX)</Label>
          <Input
            id="wb-min"
            type="number"
            inputMode="numeric"
            value={minBal}
            onChange={(e) => setMinBal(e.target.value)}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="wb-max" className="text-xs">Max balance (UGX)</Label>
          <Input
            id="wb-max"
            type="number"
            inputMode="numeric"
            value={maxBal}
            onChange={(e) => setMaxBal(e.target.value)}
            placeholder="No limit"
            className="mt-1"
          />
        </div>
        <div className="flex items-end justify-end">
          <button
            type="button"
            onClick={() => { setSearch(''); setMinBal(''); setMaxBal(''); }}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Summary line */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>{filtered.length.toLocaleString()} wallets shown {data && data.length >= 1000 ? '(top 1,000 by balance)' : ''}</span>
        <span className="font-mono tabular-nums font-semibold text-foreground">
          Total shown: {formatUGX(totalShown)}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold w-8"></th>
                <th className="px-3 py-2 font-semibold">Owner</th>
                <th className="px-3 py-2 font-semibold text-right">Total</th>
                <th className={`px-3 py-2 font-semibold text-right ${focusBucket === 'withdrawable' ? 'text-primary' : ''}`}>Withdrawable</th>
                <th className={`px-3 py-2 font-semibold text-right ${focusBucket === 'float' ? 'text-primary' : ''}`}>Float</th>
                <th className="px-3 py-2 font-semibold text-right">Advance</th>
                <th className="px-3 py-2 font-semibold text-right">Locked</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading wallets…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    No wallets match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const isOpen = expanded === row.user_id;
                  return (
                    <Fragment key={row.user_id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : row.user_id)}
                        className="border-t border-border/60 hover:bg-muted/30 cursor-pointer"
                      >
                        <td className="px-3 py-2 text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{row.full_name}</div>
                          <div className="text-[11px] text-muted-foreground">{row.phone || '—'}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{formatUGX(row.balance)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${focusBucket === 'withdrawable' ? 'text-primary font-semibold' : ''}`}>{formatUGX(row.withdrawable)}</td>
                        <td className={`px-3 py-2 text-right font-mono tabular-nums ${focusBucket === 'float' ? 'text-primary font-semibold' : ''}`}>{formatUGX(row.float)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-warning">{row.advance > 0 ? formatUGX(row.advance) : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{row.locked > 0 ? formatUGX(row.locked) : '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-border/60">
                          <td colSpan={7} className="p-0">
                            <WalletBucketLedgerDetail
                              userId={row.user_id}
                              withdrawable={row.withdrawable}
                              float={row.float}
                              advance={row.advance}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
