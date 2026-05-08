import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search, Wallet, Lock } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

/**
 * Read-only wallet breakdown for managers / Fin Ops. Lists every wallet
 * with the cached balance buckets, joined to the owner's name + phone.
 *
 * Filters:
 *   - Free-text search across full name / phone (case-insensitive)
 *   - Min / Max total balance range (UGX)
 *
 * No mutation hooks, no buttons. Pure observability.
 */
export function WalletBreakdownReadOnly() {
  const [search, setSearch] = useState('');
  const [minBal, setMinBal] = useState<string>('');
  const [maxBal, setMaxBal] = useState<string>('');

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

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);

      const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));

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
    return data.filter((row) => {
      if (q) {
        const hay = `${row.full_name} ${row.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (min !== null && row.balance < min) return false;
      if (max !== null && row.balance > max) return false;
      return true;
    });
  }, [data, search, minBal, maxBal]);

  const totalShown = filtered.reduce((s, r) => s + r.balance, 0);

  return (
    <div className="space-y-5">
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
                <th className="px-3 py-2 font-semibold">Owner</th>
                <th className="px-3 py-2 font-semibold text-right">Total</th>
                <th className="px-3 py-2 font-semibold text-right">Withdrawable</th>
                <th className="px-3 py-2 font-semibold text-right">Float</th>
                <th className="px-3 py-2 font-semibold text-right">Advance</th>
                <th className="px-3 py-2 font-semibold text-right">Locked</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading wallets…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No wallets match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.user_id} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{row.full_name}</div>
                      <div className="text-[11px] text-muted-foreground">{row.phone || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{formatUGX(row.balance)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatUGX(row.withdrawable)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatUGX(row.float)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-warning">{row.advance > 0 ? formatUGX(row.advance) : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{row.locked > 0 ? formatUGX(row.locked) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
