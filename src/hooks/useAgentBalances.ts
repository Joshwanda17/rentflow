import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AgentSplitBalances {
  floatBalance: number;
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

      const { data: result, error } = await supabase.rpc('get_agent_split_balances', {
        p_agent_id: effectiveId,
      });

      if (error) {
        console.error('[useAgentBalances] RPC error:', error);
        throw error;
      }

      const row = Array.isArray(result) ? result[0] : result;
      const floatBalance = Number(row?.float_balance ?? 0);
      const commissionBalance = Number(row?.commission_balance ?? 0);

      console.log('[useAgentBalances] fetched:', { floatBalance, commissionBalance, effectiveId });

      return {
        floatBalance,
        commissionBalance,
        totalBalance: floatBalance + commissionBalance,
      };
    },
    enabled: !!effectiveId,
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
  });

  return {
    floatBalance: data?.floatBalance ?? 0,
    commissionBalance: data?.commissionBalance ?? 0,
    totalBalance: data?.totalBalance ?? 0,
    isLoading,
    error,
    refetch,
  };
}
