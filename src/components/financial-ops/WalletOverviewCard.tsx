import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, Users, ShieldCheck, Banknote, Pause, Play, MinusCircle, ChevronRight, Scale, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useFinOpsAutoRefresh, setFinOpsAutoRefresh } from '@/hooks/useFinOpsAutoRefresh';
import { Switch } from '@/components/ui/switch';

interface WalletOverviewCardProps {
  /**
   * When provided, the hero body becomes a button that opens the Wallet
   * Deductions tool. The auto-refresh toggle and inner stat tiles still
   * stop propagation so they keep their independent behavior.
   */
  onOpenDeductions?: () => void;
  /**
   * Tapping the "X with balance" pill opens Wallet Deductions pre-loaded
   * with the "All with balance" preset so operators can immediately drill
   * into every wallet currently holding money.
   */
  onViewActiveWallets?: () => void;
  /**
   * Tapping the "Ledger drift" line opens the Reconciliation tool so the
   * operator can investigate / sweep the excess. Optional — when omitted
   * the drift line is informational only.
   */
  onOpenReconciliation?: () => void;
}

export function WalletOverviewCard({ onOpenDeductions, onViewActiveWallets, onOpenReconciliation }: WalletOverviewCardProps = {}) {
  // Operators reviewing a deposit don't want the screen reshuffling under
  // their cursor. The shared toggle gates polling on this card AND on the
  // Verify Deposits hub at the same time.
  const autoRefresh = useFinOpsAutoRefresh();

  const { data, isLoading } = useQuery({
    queryKey: ['finops-wallet-overview'],
    queryFn: async () => {
      // Server-side RPC bypasses RLS and the 1000-row limit
      const { data, error } = await supabase.rpc('get_wallet_totals');
      if (error) throw error;
      const d = data as any;
      return {
        totalBalance: Number(d.total_balance ?? 0),
        walletCount: Number(d.total_wallets ?? 0),
        activeWallets: Number(d.active_wallets ?? 0),
      };
    },
    staleTime: 60_000,
    refetchInterval: autoRefresh ? 60_000 : false,
  });

  // Strict ledger companion to the cached headline above. Surfaces the
  // true ledger position so Fin Ops sees, side-by-side, how much phantom
  // cache is sitting above the real liability. This query is independent —
  // if it fails or is slow the cached headline is never blocked.
  const { data: strict, isLoading: strictLoading } = useQuery({
    queryKey: ['finops-wallet-overview-strict'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_wallet_totals_strict');
      if (error) throw error;
      const d = data as any;
      return {
        strictTotal: Number(d?.strict_total ?? 0),
        driftedWallets: Number(d?.drifted_wallets ?? 0),
        totalDrift: Number(d?.total_drift ?? 0),
      };
    },
    staleTime: 60_000,
    refetchInterval: autoRefresh ? 60_000 : false,
  });

  // Live counters that drive the two big action buttons. We only need
  // the *count* of pending items, not the rows themselves, so we use
  // head-only queries (cheap, RLS-respecting). Sequential awaits keep
  // the inferred PostgREST union from blowing up `Promise.all`'s tuple.
  const { data: queues } = useQuery({
    queryKey: ['finops-wallet-overview-queues'],
    queryFn: async () => {
      const userDeposits = await supabase
        .from('deposit_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      const fieldDeposits = await supabase
        .from('field_deposit_batches')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_finops_verification');
      const withdrawals = await supabase
        .from('withdrawal_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      return {
        depositsPending: (userDeposits.count ?? 0) + (fieldDeposits.count ?? 0),
        payoutsPending: withdrawals.count ?? 0,
      };
    },
    refetchInterval: autoRefresh ? 30_000 : false,
    staleTime: 15_000,
  });

  const interactive = !!onOpenDeductions;

  const handleOpen = () => {
    if (onOpenDeductions) onOpenDeductions();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
    }
  };

  // Drift > 100 UGX is the same tolerance the SQL function uses to count
  // a wallet as "drifted". Below that we treat it as reconciled noise.
  const driftIsMaterial = (strict?.totalDrift ?? 0) > 100 || (strict?.driftedWallets ?? 0) > 0;
  const driftClickable = driftIsMaterial && !!onOpenReconciliation;

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? 'Open Wallet Deductions' : undefined}
      onClick={interactive ? handleOpen : undefined}
      onKeyDown={interactive ? handleKey : undefined}
      className={`rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 sm:p-6 ${
        interactive
          ? 'cursor-pointer transition-all hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Total Money in All Wallets
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {interactive && (
            <span
              className="hidden sm:inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary"
              aria-hidden
            >
              <MinusCircle className="h-3 w-3" /> Tap to deduct
              <ChevronRight className="h-3 w-3" />
            </span>
          )}

          {/* Auto-refresh toggle — paused state surfaces clearly so operators
              never wonder why a number is stale. */}
          <label
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground cursor-pointer select-none shrink-0"
          title={
            autoRefresh
              ? 'Auto-refresh is on. Pause to keep the screen stable while you review.'
              : 'Auto-refresh is paused. Numbers will not update until you resume.'
          }
        >
          {autoRefresh ? (
            <Play className="h-3 w-3 text-primary" />
          ) : (
            <Pause className="h-3 w-3 text-warning" />
          )}
          <span className="uppercase tracking-wider">
            {autoRefresh ? 'Live' : 'Paused'}
          </span>
          <Switch
            checked={autoRefresh}
            onCheckedChange={setFinOpsAutoRefresh}
            aria-label="Toggle auto-refresh"
            className="ml-1"
          />
          </label>
        </div>
      </div>
      <p className={`text-3xl sm:text-4xl font-black tabular-nums tracking-tight ${isLoading ? 'animate-pulse text-muted-foreground' : 'text-foreground'}`}>
        {isLoading ? '———' : formatUGX(data?.totalBalance ?? 0)}
      </p>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {isLoading ? '—' : data?.walletCount?.toLocaleString()} wallets
        </span>
        {onViewActiveWallets ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewActiveWallets(); }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 -my-0.5 text-primary font-medium underline-offset-2 hover:bg-primary/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="View all wallets with balance"
          >
            {isLoading ? '—' : data?.activeWallets?.toLocaleString()} with balance
            <ChevronRight className="h-3 w-3" />
          </button>
        ) : (
          <span className="text-primary font-medium">
            {isLoading ? '—' : data?.activeWallets?.toLocaleString()} with balance
          </span>
        )}
      </div>

      {/* ─── Strict ledger truth row (operator transparency) ───
          The headline above is the cache total Fin Ops works from. This
          row shows what the ledger actually says so the operator can see,
          at a glance, whether the cache is drifting and by how much. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-3 pt-3 border-t border-primary/15 space-y-1.5"
      >
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Scale className="h-3 w-3" />
            <span className="uppercase tracking-wider font-semibold">Ledger total</span>
          </span>
          <span className="font-mono tabular-nums font-semibold text-foreground">
            {strictLoading ? '———' : formatUGX(strict?.strictTotal ?? 0)}
          </span>
        </div>

        {strictLoading ? (
          <p className="text-[10px] text-muted-foreground">Checking ledger alignment…</p>
        ) : driftIsMaterial ? (
          driftClickable ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenReconciliation?.(); }}
              className="w-full flex items-center justify-between gap-2 text-[11px] rounded-md px-1.5 py-1 -mx-1.5 text-warning hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
              aria-label="Open reconciliation to review cache drift"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3 w-3" />
                Ledger mismatch: +{formatUGX(strict?.totalDrift ?? 0)} across {strict?.driftedWallets ?? 0} wallet{strict?.driftedWallets === 1 ? '' : 's'}
              </span>
              <ChevronRight className="h-3 w-3" />
            </button>
          ) : (
            <p className="flex items-center gap-1.5 text-[11px] text-warning font-medium">
              <AlertTriangle className="h-3 w-3" />
              Ledger mismatch: +{formatUGX(strict?.totalDrift ?? 0)} across {strict?.driftedWallets ?? 0} wallet{strict?.driftedWallets === 1 ? '' : 's'}
            </p>
          )
        ) : (
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Ledger reconciled
          </p>
        )}
      </div>

      {/* ─── Two live key stats that mirror the two action buttons below ─── */}
      <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-primary/15">
        <div
          onClick={(e) => e.stopPropagation()}
          className="rounded-xl bg-background/60 backdrop-blur-sm border border-border p-3"
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            <ShieldCheck className="h-3 w-3" /> Awaiting verification
          </div>
          <p className="text-2xl font-black tabular-nums mt-1 text-foreground">
            {queues?.depositsPending ?? '—'}
          </p>
          <p className="text-[10px] text-muted-foreground">user + field deposits</p>
        </div>
        <div
          onClick={(e) => e.stopPropagation()}
          className="rounded-xl bg-background/60 backdrop-blur-sm border border-border p-3"
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            <Banknote className="h-3 w-3" /> Awaiting payout
          </div>
          <p className="text-2xl font-black tabular-nums mt-1 text-foreground">
            {queues?.payoutsPending ?? '—'}
          </p>
          <p className="text-[10px] text-muted-foreground">withdrawal requests</p>
        </div>
      </div>
    </div>
  );
}
