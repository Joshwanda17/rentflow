import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

/**
 * Reads the agent's landlord-payout float from `agent_landlord_float.balance`.
 * This is a SEPARATE bucket from `wallets.float_balance` (which is the
 * 3-bucket wallet model). Use this for any UI that gates landlord payouts /
 * tenant rent allocations from collected float.
 *
 * Coerces with Number() to defend against PostgREST serializing large
 * numerics as strings (which would otherwise produce NaN in arithmetic).
 */
export function useAgentLandlordFloat(agentId?: string) {
  const { user } = useAuth();
  const effectiveId = agentId || user?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['agent-landlord-float', effectiveId],
    queryFn: async (): Promise<number> => {
      if (!effectiveId) return 0;
      const { data, error } = await supabase
        .from('agent_landlord_float')
        .select('balance')
        .eq('agent_id', effectiveId)
        .maybeSingle();
      if (error) throw error;
      const n = Number(data?.balance ?? 0);
      return Number.isFinite(n) ? n : 0;
    },
    enabled: !!effectiveId,
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // Realtime: refetch when this agent's operational float row changes
  useEffect(() => {
    if (!effectiveId) return;
    const channel = supabase
      .channel(`agent-landlord-float-${effectiveId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_landlord_float', filter: `agent_id=eq.${effectiveId}` },
        () => queryClient.invalidateQueries({ queryKey: ['agent-landlord-float', effectiveId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [effectiveId, queryClient]);

  return {
    floatBalance: query.data ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}