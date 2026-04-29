import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Returns the agent's landlord-payout float using the EXACT formula the
 * `agent_allocate_tenant_payment` RPC uses to gate allocations
 * (`get_agent_float_balance` RPC = wallet ledger total − locked commission).
 *
 * Previously this hook read `agent_landlord_float.balance` directly, which
 * silently disagreed with the RPC's stricter ledger view — so the Confirm
 * button on the Pay-for-Tenant dialog appeared "broken" whenever the cached
 * row was higher than the ledger truth.
 */
export function useAgentLandlordFloat(agentId?: string) {
  const { user } = useAuth();
  const effectiveId = agentId || user?.id;

  const query = useQuery({
    queryKey: ['agent-landlord-float', effectiveId],
    queryFn: async (): Promise<number> => {
      if (!effectiveId) return 0;
      const { data, error } = await supabase.rpc('get_agent_float_balance', {
        p_agent_id: effectiveId,
      });
      if (error) throw error;
      const n = Number(data ?? 0);
      return Number.isFinite(n) ? n : 0;
    },
    enabled: !!effectiveId,
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  return {
    floatBalance: query.data ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}