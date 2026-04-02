import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TOTAL_POOL_UGX, TOTAL_SHARES, PRICE_PER_SHARE } from '@/components/angel-pool/constants';

export interface AngelInvestor {
  id: string;
  name: string;
  amount: number;
  shares: number;
  date: string;
  status: string;
}

export function useAngelPoolData() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['angel-pool-data'],
    queryFn: async () => {
      // Get all confirmed investments with investor names
      const { data: investments, error } = await supabase
        .from('angel_pool_investments')
        .select('id, investor_id, amount, shares, pool_ownership_percent, company_ownership_percent, status, created_at, reference_id')
        .eq('status', 'confirmed')
        .order('amount', { ascending: false });

      if (error) throw error;

      // Get investor profiles for leaderboard
      const investorIds = [...new Set((investments || []).map(i => i.investor_id))];
      let profileMap: Record<string, string> = {};

      if (investorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', investorIds);

        profileMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.full_name || 'Anonymous';
          return acc;
        }, {} as Record<string, string>);
      }

      // Aggregate by investor
      const investorAgg: Record<string, { amount: number; shares: number; latestDate: string }> = {};
      for (const inv of investments || []) {
        if (!investorAgg[inv.investor_id]) {
          investorAgg[inv.investor_id] = { amount: 0, shares: 0, latestDate: inv.created_at };
        }
        investorAgg[inv.investor_id].amount += Number(inv.amount);
        investorAgg[inv.investor_id].shares += inv.shares;
        if (inv.created_at > investorAgg[inv.investor_id].latestDate) {
          investorAgg[inv.investor_id].latestDate = inv.created_at;
        }
      }

      const topInvestors: AngelInvestor[] = Object.entries(investorAgg)
        .map(([id, agg]) => ({
          id,
          name: profileMap[id] || 'Anonymous',
          amount: agg.amount,
          shares: agg.shares,
          date: agg.latestDate,
          status: 'confirmed',
        }))
        .sort((a, b) => b.amount - a.amount);

      const totalRaised = topInvestors.reduce((s, i) => s + i.amount, 0);
      const sharesSold = topInvestors.reduce((s, i) => s + i.shares, 0);
      const sharesRemaining = TOTAL_SHARES - sharesSold;
      const progress = (totalRaised / TOTAL_POOL_UGX) * 100;

      return { totalRaised, sharesSold, sharesRemaining, progress, topInvestors, investments: investments || [] };
    },
    staleTime: 30_000,
  });

  return {
    totalRaised: data?.totalRaised ?? 0,
    sharesSold: data?.sharesSold ?? 0,
    sharesRemaining: data?.sharesRemaining ?? TOTAL_SHARES,
    progress: data?.progress ?? 0,
    topInvestors: data?.topInvestors ?? [],
    investments: data?.investments ?? [],
    isLoading,
    refetch,
  };
}
