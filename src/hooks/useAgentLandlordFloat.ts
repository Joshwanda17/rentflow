import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWalletRealtime } from '@/hooks/useWalletRealtime';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

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
      const { data, error } = await supabase.rpc('get_agent_float_balance', {
        p_agent_id: effectiveId,
      });
      if (error) throw error;
      const n = Number(data ?? 0);
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