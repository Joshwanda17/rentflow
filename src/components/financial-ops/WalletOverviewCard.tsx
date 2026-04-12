import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Wallet, Users } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';

export function WalletOverviewCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['finops-wallet-overview'],
    queryFn: async () => {
      // Use count query + paginated sum to bypass the 1000-row default limit
      const { count, error: countErr } = await supabase
        .from('wallets')
        .select('*', { count: 'exact', head: true });

      if (countErr) throw countErr;

      // Fetch ALL balances in batches of 1000 to get accurate totals
      const PAGE_SIZE = 1000;
      const totalPages = Math.ceil((count || 0) / PAGE_SIZE);
      let totalBalance = 0;
      let activeWallets = 0;

      const batchPromises = [];
      for (let i = 0; i < totalPages; i++) {
        batchPromises.push(
          supabase
            .from('wallets')
            .select('balance')
            .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
        );
      }

      const results = await Promise.all(batchPromises);
      for (const res of results) {
        if (res.error) throw res.error;
        for (const w of res.data || []) {
          const bal = Number(w.balance || 0);
          totalBalance += bal;
          if (bal > 0) activeWallets++;
        }
      }

      return { totalBalance, walletCount: count || 0, activeWallets };
    },
    staleTime: 60_000,
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
