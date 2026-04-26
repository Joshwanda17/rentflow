import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, Users, ShieldCheck, Banknote } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

export function WalletOverviewCard() {
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
  });

  // Live counters that drive the two big action buttons. We only need
  // the *count* of pending items, not the rows themselves, so we use
  // head-only queries (cheap, RLS-respecting).
  const { data: queues } = useQuery({
    queryKey: ['finops-wallet-overview-queues'],
    queryFn: async () => {
      const [userDeposits, fieldDeposits, withdrawals] = await Promise.all([
        supabase.from('manual_deposits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('field_deposit_batches').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      return {
        depositsPending: (userDeposits.count ?? 0) + (fieldDeposits.count ?? 0),
        payoutsPending: withdrawals.count ?? 0,
      };
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return (
    <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Money in All Wallets</p>
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
