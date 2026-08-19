import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  agent_phone: string | null;
  reason: string | null;
  marked_at: string;
  review_status: 'open' | 'acknowledged' | 'resolved' | 'rejected' | string;
  review_notes: string | null;
  acknowledged_at: string | null;
  reviewer_name: string | null;
  rent_amount: number | null;
  daily_repayment: number | null;
  total_repayment: number | null;
  amount_repaid: number | null;
  outstanding: number | null;
  funded_at: string | null;
  days_since_funded: number | null;
  last_collection_at: string | null;
  last_collection_amount: number | null;
  collections_count: number | null;
  days_since_last_collection: number | null;
  landlord_name: string | null;
  landlord_phone: string | null;
  house_title: string | null;
  house_area: string | null;
  trust_score: number | null;
  tenancy_status: string | null;
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

/**
 * Acknowledge / resolve actions for the inactive-tenant banner.
 * Acknowledge marks a flag as reviewed; resolve closes it out (notes required)
 * and removes it from the banner.
 */
export function useInactivationReview() {
  const qc = useQueryClient();

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ['ops-agent-inactivations'] });

  const acknowledge = useMutation({
    mutationFn: async ({ rentRequestId, notes }: { rentRequestId: string; notes?: string }) => {
      const { error } = await supabase.rpc('ops_acknowledge_inactivation', {
        p_rent_request_id: rentRequestId,
        p_notes: notes?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const resolve = useMutation({
    mutationFn: async ({ rentRequestId, notes }: { rentRequestId: string; notes: string }) => {
      const { error } = await supabase.rpc('ops_resolve_inactivation', {
        p_rent_request_id: rentRequestId,
        p_notes: notes.trim(),
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  /**
   * Reject the agent's inactive flag: the tenant goes back on the agent's book
   * and the case is returned to that agent's dashboard as a high-priority task.
   */
  const reject = useMutation({
    mutationFn: async ({ rentRequestId, notes }: { rentRequestId: string; notes: string }) => {
      const { error } = await supabase.rpc('ops_reject_inactivation', {
        p_rent_request_id: rentRequestId,
        p_notes: notes.trim(),
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return { acknowledge, resolve, reject };
}

export default useAgentInactivations;