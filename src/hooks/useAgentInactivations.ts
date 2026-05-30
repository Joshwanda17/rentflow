import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AgentInactivationRow {
  rent_request_id: string;
  tenant_id: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  tenant_city: string | null;
  agent_id: string;
  agent_name: string | null;
  reason: string | null;
  marked_at: string;
  review_status: 'open' | 'acknowledged' | 'resolved' | string;
  review_notes: string | null;
  acknowledged_at: string | null;
  reviewer_name: string | null;
}

/**
 * Recent tenants an AGENT flagged as "not paying" (inactive).
 * Tenant Ops sees these prominently and in realtime — a new flag pings the
 * shared `ops_inbox_events` feed, which triggers a refetch.
 */
export function useAgentInactivations(opsUserId?: string | null) {
  const q = useQuery({
    queryKey: ['ops-agent-inactivations'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ops_recent_agent_inactivations', {
        p_limit: 25,
        p_since_hours: 336,
      });
      if (error) throw error;
      return (data ?? []) as AgentInactivationRow[];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!opsUserId) return;
    const channel = supabase
      .channel(`ops:inactivations:${opsUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ops_inbox_events', filter: 'reason=eq.agent_marked_inactive' },
        () => q.refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [opsUserId, q]);

  return q;
}

export default useAgentInactivations;