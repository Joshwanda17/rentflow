import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const ACTIVE_RENT_STATUSES = [
  'pending', 'agent_verified', 'tenant_ops_approved',
  'agent_ops_approved', 'landlord_ops_approved',
  'coo_approved', 'funded', 'repaying',
];
export const AGENT_RENT_CAP_UGX = 100_000_000;

/**
 * Agent rating tiers based on **last 7 days' Daily Collection Rate (DCR)**.
 * DCR = (UGX collected from tenants in the last 7 days)
 *       ÷ (sum of daily_repayment across active rent_requests × 7)
 *
 *   ≥ 50%   → Positive  (per-tenant max  UGX 6,000,000)
 *   25–49%  → Fair      (per-tenant max  UGX 3,000,000)
 *   6–24%   → Bad       (per-tenant max  UGX 1,000,000)
 *   ≤ 5%    → Very Bad  (blocked from new rent requests)
 *   no active rents → Starter (per-tenant max UGX 500,000)
 */
export const AGENT_TIER_THRESHOLDS = {
  positive: 0.50,
  fair:     0.25,
  bad:      0.06,
} as const;

export type AgentCapacity = {
  used: number;
  active_count: number;
  repayment_rate: number;          // 0..1 — last 7d DCR
  expected_weekly: number;         // UGX expected from tenants over the past 7 days
  paid_last_week: number;          // UGX actually collected in last 7 days
  headroom: number;
  pct: number;
  tier: 'Positive' | 'Fair' | 'Bad' | 'Very Bad' | 'Starter';
  per_tenant_max: number;
};

export function classifyAgent(
  expected_weekly: number,
  weekly_rate: number,
): { tier: AgentCapacity['tier']; per_tenant_max: number } {
  if (expected_weekly <= 0) return { tier: 'Starter', per_tenant_max: 500_000 };
  if (weekly_rate >= AGENT_TIER_THRESHOLDS.positive)
    return { tier: 'Positive', per_tenant_max: 6_000_000 };
  if (weekly_rate >= AGENT_TIER_THRESHOLDS.fair)
    return { tier: 'Fair', per_tenant_max: 3_000_000 };
  if (weekly_rate >= AGENT_TIER_THRESHOLDS.bad)
    return { tier: 'Bad', per_tenant_max: 1_000_000 };
  return { tier: 'Very Bad', per_tenant_max: 0 };
}

/**
 * Batch-loads rent-request capacity for a set of agent IDs.
 * Repayment rate = last 7 days' Daily Collection Rate (DCR).
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
      const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // 1) Active rent_requests drive both exposure AND expected daily collections
      const { data: active } = await supabase
        .from('rent_requests')
        .select('id, agent_id, total_repayment, amount_repaid, daily_repayment')
        .in('agent_id', agentIds)
        .in('status', ACTIVE_RENT_STATUSES);

      const exposure = new Map<string, { used: number; count: number }>();
      const expectedDaily = new Map<string, number>();
      const activeIdToAgent = new Map<string, string>();
      (active || []).forEach((r: any) => {
        const owed = Math.max((Number(r.total_repayment) || 0) - (Number(r.amount_repaid) || 0), 0);
        const prev = exposure.get(r.agent_id) || { used: 0, count: 0 };
        exposure.set(r.agent_id, { used: prev.used + owed, count: prev.count + 1 });
        expectedDaily.set(
          r.agent_id,
          (expectedDaily.get(r.agent_id) || 0) + (Number(r.daily_repayment) || 0),
        );
        activeIdToAgent.set(r.id, r.agent_id);
      });

      // 2) Sum repayments collected in the last 7 days, scoped to active rent_requests
      const paidByAgent = new Map<string, number>();
      const activeIds = Array.from(activeIdToAgent.keys());
      if (activeIds.length > 0) {
        const BATCH = 200;
        for (let i = 0; i < activeIds.length; i += BATCH) {
          const slice = activeIds.slice(i, i + BATCH);
          const { data: pays } = await supabase
            .from('repayments')
            .select('rent_request_id, amount, created_at')
            .in('rent_request_id', slice)
            .gte('created_at', weekAgoISO);
          (pays || []).forEach((p: any) => {
            const agentId = activeIdToAgent.get(p.rent_request_id);
            if (!agentId) return;
            paidByAgent.set(agentId, (paidByAgent.get(agentId) || 0) + (Number(p.amount) || 0));
          });
        }
      }

      const out = new Map<string, AgentCapacity>();
      agentIds.forEach((id) => {
        const exp = exposure.get(id) || { used: 0, count: 0 };
        const dailyExpected = expectedDaily.get(id) || 0;
        const expected_weekly = dailyExpected * 7;
        const paid_last_week = paidByAgent.get(id) || 0;
        const repayment_rate =
          expected_weekly > 0 ? Math.min(1, paid_last_week / expected_weekly) : 0;
        const { tier, per_tenant_max } = classifyAgent(expected_weekly, repayment_rate);
        const headroom = Math.max(AGENT_RENT_CAP_UGX - exp.used, 0);
        const pct = Math.min(100, Math.round((exp.used / AGENT_RENT_CAP_UGX) * 100));
        out.set(id, {
          used: exp.used,
          active_count: exp.count,
          repayment_rate,
          expected_weekly,
          paid_last_week,
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