import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, Users, ShieldCheck, Banknote, Pause, Play } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useFinOpsAutoRefresh, setFinOpsAutoRefresh } from '@/hooks/useFinOpsAutoRefresh';
import { Switch } from '@/components/ui/switch';

export function WalletOverviewCard() {
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

  return (
    <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Total Money in All Wallets
          </p>
        </div>

        {/* Auto-refresh toggle — paused state surfaces clearly so operators
            never wonder why a number is stale. */}
        <label
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
      <p className={`text-3xl sm:text-4xl font-black tabular-nums tracking-tight ${isLoading ? 'animate-pulse text-muted-foreground' : 'text-foreground'}`}>
        {isLoading ? '———' : formatUGX(data?.totalBalance ?? 0)}
      </p>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {isLoading ? '—' : data?.walletCount?.toLocaleString()} wallets
        </span>
        <span className="text-primary font-medium">
          {isLoading ? '—' : data?.activeWallets?.toLocaleString()} with balance
        </span>
      </div>

      {/* ─── Two live key stats that mirror the two action buttons below ─── */}
      <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-primary/15">
        <div className="rounded-xl bg-background/60 backdrop-blur-sm border border-border p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            <ShieldCheck className="h-3 w-3" /> Awaiting verification
          </div>
          <p className="text-2xl font-black tabular-nums mt-1 text-foreground">
            {queues?.depositsPending ?? '—'}
          </p>
          <p className="text-[10px] text-muted-foreground">user + field deposits</p>
        </div>
        <div className="rounded-xl bg-background/60 backdrop-blur-sm border border-border p-3">
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
