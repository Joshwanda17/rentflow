import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { applyCustomerWalletLedgerFilters } from '@/lib/customerWalletHistory';

export interface WalletMovementCounts {
  last24h: number;
  last7d: number;
  last30d: number;
}

export function useWalletMovementCounts(userId?: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['wallet-movement-counts', userId],
    queryFn: async (): Promise<WalletMovementCounts> => {
      if (!userId) throw new Error('No user ID available');

      const now = new Date();
      const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [res24h, res7d, res30d] = await Promise.all([
        applyCustomerWalletLedgerFilters(supabase
          .from('general_ledger')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('ledger_scope', 'wallet')
          .gte('transaction_date', since24h)),
        applyCustomerWalletLedgerFilters(supabase
          .from('general_ledger')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('ledger_scope', 'wallet')
          .gte('transaction_date', since7d)),
        applyCustomerWalletLedgerFilters(supabase
          .from('general_ledger')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('ledger_scope', 'wallet')
          .gte('transaction_date', since30d)),
      ]);

      return {
        last24h: res24h.count ?? 0,
        last7d: res7d.count ?? 0,
        last30d: res30d.count ?? 0,
      };
    },
    enabled: !!userId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  return {
    counts: data ?? { last24h: 0, last7d: 0, last30d: 0 },
    isLoading,
  };
}
