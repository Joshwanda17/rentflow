import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AgentSplitBalances {
  floatBalance: number;
  commissionBalance: number;
  totalBalance: number;
}

export function useAgentBalances() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['agent-split-balances', user?.id],
    queryFn: async (): Promise<AgentSplitBalances> => {
      if (!user?.id) return { floatBalance: 0, commissionBalance: 0, totalBalance: 0 };

      const { data: result, error } = await supabase.rpc('get_agent_split_balances', {
        p_agent_id: user.id,
      });

      if (error) {
        console.error('[useAgentBalances] RPC error:', error);
        return { floatBalance: 0, commissionBalance: 0, totalBalance: 0 };
      }

      const row = Array.isArray(result) ? result[0] : result;
      const floatBalance = Number(row?.float_balance ?? 0);
      const commissionBalance = Number(row?.commission_balance ?? 0);

      return {
        floatBalance,
        commissionBalance,
        totalBalance: floatBalance + commissionBalance,
      };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  return {
    floatBalance: data?.floatBalance ?? 0,
    commissionBalance: data?.commissionBalance ?? 0,
    totalBalance: data?.totalBalance ?? 0,
    isLoading,
    refetch,
  };
}
