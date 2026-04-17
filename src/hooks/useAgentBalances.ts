import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AgentSplitBalances {
  withdrawableBalance: number;
  floatBalance: number;
  advanceBalance: number;
  /** @deprecated Use withdrawableBalance. Kept for backward compatibility. */
  commissionBalance: number;
  totalBalance: number;
}

export function useAgentBalances(agentId?: string) {
  const { user } = useAuth();
  const effectiveId = agentId || user?.id;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['agent-split-balances', effectiveId],
    queryFn: async (): Promise<AgentSplitBalances> => {
      if (!effectiveId) throw new Error('No agent ID available');

      // Read directly from wallets table (3-bucket model)
      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('withdrawable_balance, float_balance, advance_balance, balance')
        .eq('user_id', effectiveId)
        .maybeSingle();

      if (error) {
        console.error('[useAgentBalances] error:', error);
        throw error;
      }

      const withdrawableBalance = Number((wallet as any)?.withdrawable_balance ?? 0);
      const floatBalance = Number((wallet as any)?.float_balance ?? 0);
      const advanceBalance = Number((wallet as any)?.advance_balance ?? 0);

      return {
        withdrawableBalance,
        floatBalance,
        advanceBalance,
        commissionBalance: withdrawableBalance, // legacy alias
        totalBalance: withdrawableBalance + floatBalance,
      };
    },
    enabled: !!effectiveId,
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
  });

  return {
    withdrawableBalance: data?.withdrawableBalance ?? 0,
    floatBalance: data?.floatBalance ?? 0,
    advanceBalance: data?.advanceBalance ?? 0,
    commissionBalance: data?.commissionBalance ?? 0,
    totalBalance: data?.totalBalance ?? 0,
    isLoading,
    error,
    refetch,
  };
}
