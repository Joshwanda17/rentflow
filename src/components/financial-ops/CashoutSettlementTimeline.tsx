import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDynamic } from '@/lib/currencyFormat';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { format } from 'date-fns';
import {
  ArrowLeftRight, Search, Loader2, RefreshCw, X,
  ChevronLeft, ChevronRight, Wallet, Coins, Banknote, User, Store,
} from 'lucide-react';

type Row = {
  withdrawal_id: string;
  settled_at: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  withdrawal_amount: number | null;
  withdrawal_status: string | null;
  merchant_id: string | null;
  merchant_name: string | null;
  merchant_phone: string | null;
  reimbursement_amount: number | null;
  commission_amount: number | null;
  total_credited: number | null;
  total_count: number;
};

const PAGE_SIZE = 25;

/**
 * Cash-Out Settlement Timeline — a single auditable ledger view that pairs every
 * cash-out withdrawal with the merchant's principal reimbursement (the cash they
 * fronted, credited back to their withdrawable wallet) and the 0.5% commission.
 * All three legs come straight from general_ledger via the
 * get_cashout_settlement_timeline RPC, so Financial Ops can audit each payout in
 * one place. Search + pagination run server-side for scale.
 */
export function CashoutSettlementTimeline() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => { setPage(0); }, [debouncedSearch]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['cashout-settlement-timeline', debouncedSearch, page],
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc('get_cashout_settlement_timeline', {
        p_search: debouncedSearch.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      const rows = (result || []) as Row[];
      return { rows, total: rows[0]?.total_count ?? 0 };
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5">
          <ArrowLeftRight className="h-6 w-6 text-violet-600" />
          Cash-Out Settlement Timeline
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Each cash-out withdrawal with the merchant's principal reimbursement and the
          0.5% commission — one auditable ledger trail per payout.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Search</CardTitle>
            <Button variant="outline" size="sm" className="gap-2 h-8" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer, merchant, phone or withdrawal ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="outline" className="px-3 py-1">{total.toLocaleString()} settlement{total === 1 ? '' : 's'}</Badge>
        {isFetching && !isLoading && (
          <Badge variant="outline" className="px-3 py-1 gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Updating
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No cash-out settlements match your search.
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[640px]">
                <div className="divide-y divide-border">
                  {rows.map((r) => (
                    <div key={r.withdrawal_id} className="p-4 space-y-3">
                      {/* Header: customer payout + when */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-semibold">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{r.customer_name || 'Unknown customer'}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {r.customer_phone || '—'} · #{r.withdrawal_id.slice(0, 8)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] text-muted-foreground">
                            {r.settled_at ? format(new Date(r.settled_at), 'dd MMM yyyy, HH:mm') : '—'}
                          </p>
                          {r.withdrawal_status && (
                            <Badge className="mt-0.5 text-[10px] px-1.5 py-0 border-0 bg-muted text-muted-foreground">
                              {r.withdrawal_status.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Merchant who settled */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Store className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          Settled by <span className="font-medium text-foreground">{r.merchant_name || 'Unknown merchant'}</span>
                          {r.merchant_phone ? ` · ${r.merchant_phone}` : ''}
                        </span>
                      </div>

                      {/* Three ledger legs */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <LegTile
                          icon={<Banknote className="h-3.5 w-3.5" />}
                          label="Withdrawal (customer)"
                          amount={r.withdrawal_amount}
                          tone="muted"
                        />
                        <LegTile
                          icon={<Wallet className="h-3.5 w-3.5" />}
                          label="Reimbursed to merchant"
                          amount={r.reimbursement_amount}
                          tone="emerald"
                        />
                        <LegTile
                          icon={<Coins className="h-3.5 w-3.5" />}
                          label="Commission (0.5%)"
                          amount={r.commission_amount}
                          tone="violet"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-1.5 text-xs">
                        <span className="text-muted-foreground">Total credited to merchant wallet:</span>
                        <span className="font-semibold">{formatDynamic(Number(r.total_credited ?? 0))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                <span className="text-[11px] text-muted-foreground">Page {page + 1} of {totalPages}</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="icon" className="h-7 w-7"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || isFetching}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline" size="icon" className="h-7 w-7"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1 || isFetching}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LegTile({
  icon, label, amount, tone,
}: {
  icon: React.ReactNode;
  label: string;
  amount: number | null;
  tone: 'muted' | 'emerald' | 'violet';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : tone === 'violet'
        ? 'bg-violet-500/10 text-violet-700 dark:text-violet-400'
        : 'bg-muted text-muted-foreground';
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${toneClass}`}>
        {icon}
        {label}
      </div>
      <p className="mt-1.5 text-sm font-semibold tabular-nums">{formatDynamic(Number(amount ?? 0))}</p>
    </div>
  );
}