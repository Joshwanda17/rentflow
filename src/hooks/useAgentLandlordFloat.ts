import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWalletRealtime } from '@/hooks/useWalletRealtime';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Returns the agent's landlord-payout float from `agent_landlord_float.balance`.
 *
 * This is the CFO-allocated pool the agent uses to pay landlords — it is
 * intentionally separate from the wallet ledger float bucket. Reads go
 * straight to the `agent_landlord_float` row so the CFO's disbursement is
 * what the agent sees and spends against.
 */
export function useAgentLandlordFloat(agentId?: string) {
  const { user } = useAuth();
  const effectiveId = agentId || user?.id;
  const queryClient = useQueryClient();

  // Piggy-back on the wallet realtime stream so that the instant any
  // approve-deposit / ledger insert / wallet bucket change lands for this
  // agent, the landlord-payout float view is invalidated and refetched.
  useWalletRealtime(effectiveId, [['agent-landlord-float', effectiveId ?? '']]);

  // Also listen for deposit_requests transitions (pending → approved) so the
  // float shows up the moment FinOps / auto-credit flips the row, even if
  // the ledger insert event is debounced behind it.
  useEffect(() => {
    if (!effectiveId) return;
    const channel = supabase
      .channel(`agent-float-deposits-${effectiveId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deposit_requests',
          filter: `user_id=eq.${effectiveId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['agent-landlord-float', effectiveId] });
          queryClient.invalidateQueries({ queryKey: ['agent-split-balances', effectiveId] });
          queryClient.invalidateQueries({ queryKey: ['wallet', effectiveId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveId, queryClient]);

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
    // Float is safety-critical for landlord payouts; never serve stale.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30_000,
  });

  return {
    floatBalance: query.data ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}