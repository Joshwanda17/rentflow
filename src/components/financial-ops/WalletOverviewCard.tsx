import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, Users } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

export function WalletOverviewCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['finops-wallet-overview'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('balance');

      if (error) throw error;

      const wallets = data || [];
      const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);
      const activeWallets = wallets.filter(w => Number(w.balance) > 0).length;

      return { totalBalance, walletCount: wallets.length, activeWallets };
    },
    staleTime: 30_000,
  });

  return (
    <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Money in All Wallets</p>
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
        <span className="text-primary font-medium">
          {isLoading ? '—' : data?.activeWallets?.toLocaleString()} with balance
        </span>
      </div>
    </div>
  );
}
