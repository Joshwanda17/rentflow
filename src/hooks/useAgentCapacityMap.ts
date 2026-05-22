import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const ACTIVE_RENT_STATUSES = [
  'pending', 'agent_verified', 'tenant_ops_approved',
  'agent_ops_approved', 'landlord_ops_approved',
  'coo_approved', 'funded', 'repaying',
];
export const AGENT_RENT_CAP_UGX = 100_000_000;

/**
 * Agent rating tiers based on **last 7 days' Daily Response Rate (DRR)**.
 *
 * We deliberately measure RESPONSIVENESS, not amount collected. An agent
 * whose tenants pay something — even a small amount — every day is doing
 * the hardest part of the job (keeping the tenant engaged) and is rewarded
 * for it.
 *
 *   DRR = (count of (tenant × day) cells in the last 7 days where the
 *          tenant made at least one repayment)
 *         ÷ (active tenants × 7)
 *
 *   ≥ 70%   → Positive  (per-tenant max  UGX 6,000,000)
 *   40–69%  → Fair      (per-tenant max  UGX 3,000,000)
 *   10–39%  → Bad       (per-tenant max  UGX 1,000,000)
 *   < 10%   → Very Bad  (blocked from new rent requests)
 *   no active rents → Starter (per-tenant max UGX 500,000)
 */
export const AGENT_TIER_THRESHOLDS = {
  positive: 0.70,
  fair:     0.40,
  bad:      0.10,
} as const;

export type AgentCapacity = {
  used: number;
  active_count: number;
  /** Distinct tenants the agent is currently collecting from (active rent_requests). */
  active_tenant_count: number;
  /** Distinct tenants who made at least one payment in the last 7 days. Plain-English KPI. */
  paying_tenants_last_week: number;
  /** Last 7-day Daily Response Rate (0..1). Primary tier metric. */
  response_rate: number;
  /** Count of (tenant × day) cells in last 7d where the tenant paid ≥ UGX 1. */
  responding_tenant_days: number;
  /** Maximum possible responding cells = active_count × 7. */
  expected_tenant_days: number;
  /** Secondary stat — total UGX collected in last 7 days. */
  paid_last_week: number;
  /** @deprecated alias of `response_rate` kept for backwards compatibility. */
  repayment_rate: number;
  /** @deprecated kept for backwards compatibility (= daily_expected × 7). */
  expected_weekly: number;
  headroom: number;
  pct: number;
  tier: 'Positive' | 'Fair' | 'Bad' | 'Very Bad' | 'Starter';
  per_tenant_max: number;
};

export function classifyAgent(
  active_count: number,
  response_rate: number,
): { tier: AgentCapacity['tier']; per_tenant_max: number } {
  if (active_count <= 0) return { tier: 'Starter', per_tenant_max: 500_000 };
  if (response_rate >= AGENT_TIER_THRESHOLDS.positive)
    return { tier: 'Positive', per_tenant_max: 6_000_000 };
  if (response_rate >= AGENT_TIER_THRESHOLDS.fair)
    return { tier: 'Fair', per_tenant_max: 3_000_000 };
  if (response_rate >= AGENT_TIER_THRESHOLDS.bad)
    return { tier: 'Bad', per_tenant_max: 1_000_000 };
  return { tier: 'Very Bad', per_tenant_max: 0 };
}

/**
 * Batch-loads rent-request capacity for a set of agent IDs.
 * Rating metric = last 7 days' Daily Response Rate (DRR) — see header.
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
        .select('id, agent_id, tenant_id, total_repayment, amount_repaid, daily_repayment')
        .in('agent_id', agentIds)
        .in('status', ACTIVE_RENT_STATUSES);

      // 1a) Drop rent_requests the agent has fully "Marked not funded"
      //     (a reversal record exists AND there's no remaining net repayment).
      //     Such tenants should not count toward the agent's expected
      //     response denominator.
      const allActiveIds = (active || []).map((r: any) => r.id);
      const unfundedIds = new Set<string>();
      if (allActiveIds.length > 0) {
        const { data: revs } = await supabase
          .from('agent_tenant_float_reversals')
          .select('rent_request_id')
          .in('rent_request_id', allActiveIds);
        const reversedSet = new Set((revs || []).map((r: any) => r.rent_request_id));
        (active || []).forEach((r: any) => {
          if (reversedSet.has(r.id) && (Number(r.amount_repaid) || 0) <= 0) {
            unfundedIds.add(r.id);
          }
        });
      }

      const exposure = new Map<string, { used: number; count: number }>();
      const expectedDaily = new Map<string, number>();
      const activeIdToAgent = new Map<string, string>();
      const activeIdToTenant = new Map<string, string>();
      const activeTenantsByAgent = new Map<string, Set<string>>();
      (active || []).forEach((r: any) => {
        if (unfundedIds.has(r.id)) return; // agent marked not funded → excluded from expected
        const owed = Math.max((Number(r.total_repayment) || 0) - (Number(r.amount_repaid) || 0), 0);
        const prev = exposure.get(r.agent_id) || { used: 0, count: 0 };
        exposure.set(r.agent_id, { used: prev.used + owed, count: prev.count + 1 });
        expectedDaily.set(
          r.agent_id,
          (expectedDaily.get(r.agent_id) || 0) + (Number(r.daily_repayment) || 0),
        );
        activeIdToAgent.set(r.id, r.agent_id);
        if (r.tenant_id) {
          activeIdToTenant.set(r.id, r.tenant_id);
          let s = activeTenantsByAgent.get(r.agent_id);
          if (!s) { s = new Set(); activeTenantsByAgent.set(r.agent_id, s); }
          s.add(r.tenant_id);
        }
      });

      // 2) For each active rent_request, find DISTINCT calendar days in
      //    the last 7 with at least one repayment (any amount). Aggregate
      //    those (rent × day) cells per agent — that's the DRR numerator.
      const paidByAgent = new Map<string, number>();
      const respondingDaysByAgent = new Map<string, number>();
      const payingTenantsByAgent = new Map<string, Set<string>>();
      const activeIds = Array.from(activeIdToAgent.keys());
      if (activeIds.length > 0) {
        const BATCH = 200;
        for (let i = 0; i < activeIds.length; i += BATCH) {
          const slice = activeIds.slice(i, i + BATCH);
          const { data: pays } = await supabase
            .from('repayments')
            .select('rent_request_id, amount, created_at, tenant_id')
            .in('rent_request_id', slice)
            .gte('created_at', weekAgoISO);
          // Per-rent unique paying-day sets
          const dayKeyByRent = new Map<string, Set<string>>();
          (pays || []).forEach((p: any) => {
            const amt = Number(p.amount) || 0;
            const agentId = activeIdToAgent.get(p.rent_request_id);
            if (!agentId) return;
            paidByAgent.set(agentId, (paidByAgent.get(agentId) || 0) + amt);
            if (amt <= 0) return;
            const tenantId = p.tenant_id || activeIdToTenant.get(p.rent_request_id);
            if (tenantId) {
              let pt = payingTenantsByAgent.get(agentId);
              if (!pt) { pt = new Set(); payingTenantsByAgent.set(agentId, pt); }
              pt.add(tenantId);
            }
            const day = (p.created_at as string).slice(0, 10);
            let set = dayKeyByRent.get(p.rent_request_id);
            if (!set) { set = new Set(); dayKeyByRent.set(p.rent_request_id, set); }
            set.add(day);
          });
          // Roll up rent-level day sets into per-agent (rent × day) cell counts
          dayKeyByRent.forEach((daySet, rentId) => {
            const agentId = activeIdToAgent.get(rentId);
            if (!agentId) return;
            respondingDaysByAgent.set(
              agentId,
              (respondingDaysByAgent.get(agentId) || 0) + daySet.size,
            );
          });
        }
      }

      const out = new Map<string, AgentCapacity>();
      agentIds.forEach((id) => {
        const exp = exposure.get(id) || { used: 0, count: 0 };
        const dailyExpected = expectedDaily.get(id) || 0;
        const expected_weekly = dailyExpected * 7;
        const paid_last_week = paidByAgent.get(id) || 0;
        const expected_tenant_days = exp.count * 7;
        const responding_tenant_days = Math.min(
          respondingDaysByAgent.get(id) || 0,
          expected_tenant_days,
        );
        const response_rate =
          expected_tenant_days > 0
            ? Math.min(1, responding_tenant_days / expected_tenant_days)
            : 0;
        const { tier, per_tenant_max } = classifyAgent(exp.count, response_rate);
        const headroom = Math.max(AGENT_RENT_CAP_UGX - exp.used, 0);
        const pct = Math.min(100, Math.round((exp.used / AGENT_RENT_CAP_UGX) * 100));
        out.set(id, {
          used: exp.used,
          active_count: exp.count,
          active_tenant_count: activeTenantsByAgent.get(id)?.size || 0,
          paying_tenants_last_week: payingTenantsByAgent.get(id)?.size || 0,
          response_rate,
          responding_tenant_days,
          expected_tenant_days,
          paid_last_week,
          repayment_rate: response_rate,
          expected_weekly,
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