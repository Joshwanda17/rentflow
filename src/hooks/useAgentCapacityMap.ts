import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const ACTIVE_RENT_STATUSES = [
  'pending', 'agent_verified', 'tenant_ops_approved',
  'agent_ops_approved', 'landlord_ops_approved',
  'coo_approved', 'funded', 'repaying',
];
export const AGENT_RENT_CAP_UGX = 100_000_000;

export type AgentCapacity = {
  used: number;
  active_count: number;
  repayment_rate: number; // 0..1 over last 180d
  headroom: number;
  pct: number;
  tier: 'Premium' | 'Reliable' | 'Building' | 'Starter' | 'Defaulting';
  per_tenant_max: number;
};

function classify(active_count: number, repayment_rate: number): { tier: AgentCapacity['tier']; per_tenant_max: number } {
  if (repayment_rate >= 0.95) return { tier: 'Premium', per_tenant_max: 6_000_000 };
  if (repayment_rate >= 0.8) return { tier: 'Reliable', per_tenant_max: 3_000_000 };
  if (repayment_rate >= 0.6) return { tier: 'Building', per_tenant_max: 1_500_000 };
  if (active_count === 0) return { tier: 'Starter', per_tenant_max: 500_000 };
  return { tier: 'Defaulting', per_tenant_max: 0 };
}

/**
 * Batch-loads rent-request capacity for a set of agent IDs.
 * Returns a Map keyed by agent_id.
 */
export function useAgentCapacityMap(agentIds: string[]) {
  const sortedKey = [...agentIds].sort().join(',');
  return useQuery({
    queryKey: ['agent-capacity-map', sortedKey],
    enabled: agentIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, AgentCapacity>> => {
      if (agentIds.length === 0) return new Map();
      const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

      const [activeRes, historyRes] = await Promise.all([
        supabase
          .from('rent_requests')
          .select('agent_id, total_repayment, amount_repaid')
          .in('agent_id', agentIds)
          .in('status', ACTIVE_RENT_STATUSES),
        supabase
          .from('rent_requests')
          .select('agent_id, total_repayment, amount_repaid, created_at')
          .in('agent_id', agentIds)
          .gte('created_at', since),
      ]);

      const exposure = new Map<string, { used: number; count: number }>();
      (activeRes.data || []).forEach((r: any) => {
        const owed = Math.max((Number(r.total_repayment) || 0) - (Number(r.amount_repaid) || 0), 0);
        const prev = exposure.get(r.agent_id) || { used: 0, count: 0 };
        exposure.set(r.agent_id, { used: prev.used + owed, count: prev.count + 1 });
      });

      const rate = new Map<string, { expected: number; paid: number }>();
      (historyRes.data || []).forEach((r: any) => {
        const expected = Number(r.total_repayment) || 0;
        const paid = Number(r.amount_repaid) || 0;
        const prev = rate.get(r.agent_id) || { expected: 0, paid: 0 };
        rate.set(r.agent_id, { expected: prev.expected + expected, paid: prev.paid + paid });
      });

      const out = new Map<string, AgentCapacity>();
      agentIds.forEach((id) => {
        const exp = exposure.get(id) || { used: 0, count: 0 };
        const r = rate.get(id);
        const repayment_rate = r && r.expected > 0 ? r.paid / r.expected : 0;
        const { tier, per_tenant_max } = classify(exp.count, repayment_rate);
        const headroom = Math.max(AGENT_RENT_CAP_UGX - exp.used, 0);
        const pct = Math.min(100, Math.round((exp.used / AGENT_RENT_CAP_UGX) * 100));
        out.set(id, {
          used: exp.used,
          active_count: exp.count,
          repayment_rate,
          headroom,
          pct,
          tier,
          per_tenant_max,
        });
      });
      return out;
    },
  });
}