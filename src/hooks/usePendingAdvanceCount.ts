import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Approval stages an advance request travels through. Each stage reviews the
 * request while it holds the mapped status, then bumps it to the next status.
 */
export type AdvanceStage = 'agent_ops' | 'tenant_ops' | 'landlord_ops' | 'coo';

/** The status a request holds while it is awaiting a given stage's review. */
const STAGE_FILTER_STATUS: Record<AdvanceStage, string> = {
  agent_ops: 'pending',
  tenant_ops: 'agent_ops_approved',
  landlord_ops: 'tenant_ops_approved',
  coo: 'landlord_ops_approved',
};

/**
 * Count of agent advance requests awaiting review at the given approval stage.
 * Used to badge each reviewer's "Advances" menu item so every desk in the
 * approval line sees, at a glance, how many requests are waiting on them.
 * Kept live via a realtime subscription on agent_advance_requests.
 *
 * Defaults to the agent-ops stage (brand-new `pending` requests).
 */
export function usePendingAdvanceCount(stage: AdvanceStage = 'agent_ops') {
  const queryClient = useQueryClient();
  const filterStatus = STAGE_FILTER_STATUS[stage];

  const query = useQuery({
    queryKey: ['pending-advance-count', stage],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('agent_advance_requests_privileged')
        .select('id', { count: 'exact', head: true })
        .eq('status', filterStatus);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`pending-advance-count-${stage}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_advance_requests' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['pending-advance-count', stage] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, stage]);

  return query.data ?? 0;
}
