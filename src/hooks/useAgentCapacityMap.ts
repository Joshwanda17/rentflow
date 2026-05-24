import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const ACTIVE_RENT_STATUSES = [
  'pending', 'agent_verified', 'tenant_ops_approved',
  'agent_ops_approved', 'landlord_ops_approved',
  'coo_approved', 'funded', 'repaying',
];
export const AGENT_RENT_CAP_UGX = 100_000_000;

/**
 * Daily Eligibility Law (new):
 *   An agent is UNBLOCKED and rated "Good" (green) as soon
 *   as EITHER yesterday's OR today's collections reach 20%
 *   of their expected daily rent. Today's progress counts
 *   live — the moment an agent crosses the 20% line today,
 *   their rating flips up and they may post new rent
 *   requests immediately. If neither yesterday nor today
 *   is at 20%, they stay BLOCKED until they catch up.
 *
 *   Agents with no active rent collections yet (Starter)
 *   are always allowed to post their first request.
 *
 *   PAUSED (2026-05-24): Daily eligibility law is temporarily
 *   disabled. can_post_rent_today is always true while this flag
 *   is set. All daily stats (rating, percentages) continue to
 *   compute for informational display.
 */
export const DAILY_ELIGIBILITY_THRESHOLD = 0.20;
export const PAUSE_DAILY_ELIGIBILITY = true;

/**
 * Daily rating tiers based on the BEST of yesterday's and today's
 * collection ratios (paid / expected_daily). 20% is the unblock line
 * and is explicitly the start of "Good". Using the best of the two
 * lets a strong day TODAY immediately lift an agent out of "Very Bad"
 * instead of forcing them to wait until tomorrow.
 *
 *   ≥ 50%        → Very Good  (emerald, allowed)
 *   20% – <50%   → Good       (green,   allowed)
 *   15% – <20%   → Fair       (amber,   BLOCKED)
 *   5%  – <15%   → Bad        (orange,  BLOCKED)
 *   < 5%         → Very Bad   (red,     BLOCKED)
 */
export const DAILY_RATING_THRESHOLDS = {
  very_good: 0.50,
  good:      0.20,
  fair:      0.15,
  bad:       0.05,
} as const;

export type DailyRating =
  | 'Very Good' | 'Good' | 'Fair' | 'Bad' | 'Very Bad' | 'Starter';

export function classifyDailyRating(
  active_count: number,
  yesterday_pct: number,
): DailyRating {
  if (active_count <= 0) return 'Starter';
  if (yesterday_pct >= DAILY_RATING_THRESHOLDS.very_good) return 'Very Good';
  if (yesterday_pct >= DAILY_RATING_THRESHOLDS.good)      return 'Good';
  if (yesterday_pct >= DAILY_RATING_THRESHOLDS.fair)      return 'Fair';
  if (yesterday_pct >= DAILY_RATING_THRESHOLDS.bad)       return 'Bad';
  return 'Very Bad';
}

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
  /** Distinct tenants the agent has fully marked "Not Funded" (reversed + zero net repayment). */
  unfunded_tenant_count: number;
  /** Last 7-day Daily Response Rate (0..1). Primary tier metric. */
  response_rate: number;
  /** Count of (tenant × day) cells in last 7d where the tenant paid ≥ UGX 1. */
  responding_tenant_days: number;
  /** Maximum possible responding cells = active_count × 7. */
  expected_tenant_days: number;
  /** Secondary stat — total UGX collected in last 7 days. */
  paid_last_week: number;
  /** UGX collected today (since local midnight). */
  paid_today: number;
  /** UGX collected YESTERDAY (the previous calendar day, local midnight to midnight). */
  paid_yesterday: number;
  /** Yesterday's collection ratio = paid_yesterday / expected_daily (0..1+). */
  yesterday_response_pct: number;
  /** Today's collection ratio = paid_today / expected_daily (0..1+). */
  today_response_pct: number;
  /** The ratio actually driving the rating = max(today, yesterday). */
  effective_daily_pct: number;
  /**
   * Daily eligibility status driven by yesterday's performance:
   *   - 'starter' : no active rents to measure → always allowed
   *   - 'good'    : yesterday ≥ 20% of expected daily → allowed today, green
   *   - 'blocked' : yesterday < 20% of expected daily → blocked today, red
   */
  daily_status: 'starter' | 'good' | 'blocked';
  /** 5-tier human label for yesterday's performance. */
  daily_rating: DailyRating;
  /** True iff agent may post a new rent request today. */
  can_post_rent_today: boolean;
  /** Sum of daily_repayment across active (non-unfunded) rent_requests. */
  expected_daily: number;
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
  const queryClient = useQueryClient();

  // Auto-invalidate whenever a tracked rent_request changes (amount_repaid /
  // status flips when ANY allocation/repayment lands — online, offline edge
  // function, cron auto-charge, manual unallocate). Catches every write path
  // so the rating recalculates immediately without per-mutation invalidation.
  useEffect(() => {
    if (agentIds.length === 0) return;
    const channel = supabase
      .channel(`agent-capacity-${sortedKey.slice(0, 32) || 'empty'}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rent_requests' },
        (payload: any) => {
          const agentId = payload?.new?.agent_id || payload?.old?.agent_id;
          if (!agentId || !agentIds.includes(agentId)) return;
          queryClient.invalidateQueries({ queryKey: ['agent-capacity-map'] });
          queryClient.invalidateQueries({ queryKey: ['agent-rent-capacity-fleet'] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rent_requests' },
        (payload: any) => {
          const agentId = payload?.new?.agent_id;
          if (!agentId || !agentIds.includes(agentId)) return;
          queryClient.invalidateQueries({ queryKey: ['agent-capacity-map'] });
          queryClient.invalidateQueries({ queryKey: ['agent-rent-capacity-fleet'] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sortedKey, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  return useQuery({
    queryKey: ['agent-capacity-map', sortedKey],
    enabled: agentIds.length > 0,
    // Short stale window + always refetch on mount/focus so navigating back
    // to any agent panel reflects collections made seconds ago.
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Map<string, AgentCapacity>> => {
      if (agentIds.length === 0) return new Map();
      const weekAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartMs = todayStart.getTime();
      const yesterdayStartMs = todayStartMs - 24 * 60 * 60 * 1000;

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
      const unfundedTenantsByAgent = new Map<string, Set<string>>();
      if (allActiveIds.length > 0) {
        const { data: revs } = await supabase
          .from('agent_tenant_float_reversals')
          .select('rent_request_id')
          .in('rent_request_id', allActiveIds);
        const reversedSet = new Set((revs || []).map((r: any) => r.rent_request_id));
        (active || []).forEach((r: any) => {
          if (reversedSet.has(r.id) && (Number(r.amount_repaid) || 0) <= 0) {
            unfundedIds.add(r.id);
            let s = unfundedTenantsByAgent.get(r.agent_id);
            if (!s) { s = new Set(); unfundedTenantsByAgent.set(r.agent_id, s); }
            if (r.tenant_id) s.add(r.tenant_id);
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
      const paidTodayByAgent = new Map<string, number>();
      const paidYesterdayByAgent = new Map<string, number>();
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
            const ts = new Date(p.created_at).getTime();
            if (ts >= todayStartMs) {
              paidTodayByAgent.set(agentId, (paidTodayByAgent.get(agentId) || 0) + amt);
            } else if (ts >= yesterdayStartMs) {
              paidYesterdayByAgent.set(
                agentId,
                (paidYesterdayByAgent.get(agentId) || 0) + amt,
              );
            }
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
        const paid_yesterday = paidYesterdayByAgent.get(id) || 0;
        const yesterday_response_pct = dailyExpected > 0
          ? paid_yesterday / dailyExpected
          : 0;
        const paid_today_val = paidTodayByAgent.get(id) || 0;
        const today_response_pct = dailyExpected > 0
          ? paid_today_val / dailyExpected
          : 0;
        // Rating is driven by TODAY's collection vs today's daily target only.
        // Yesterday's % is retained for context/reporting but does not affect the rating.
        const effective_daily_pct = today_response_pct;
        let daily_status: AgentCapacity['daily_status'];
        if (exp.count <= 0) daily_status = 'starter';
        else if (effective_daily_pct >= DAILY_ELIGIBILITY_THRESHOLD) daily_status = 'good';
        else daily_status = 'blocked';
        // PAUSED: always allow posting regardless of daily status
        const can_post_rent_today = PAUSE_DAILY_ELIGIBILITY || daily_status !== 'blocked';
        const daily_rating = classifyDailyRating(exp.count, effective_daily_pct);
        out.set(id, {
          used: exp.used,
          active_count: exp.count,
          active_tenant_count: activeTenantsByAgent.get(id)?.size || 0,
          paying_tenants_last_week: payingTenantsByAgent.get(id)?.size || 0,
          unfunded_tenant_count: unfundedTenantsByAgent.get(id)?.size || 0,
          response_rate,
          responding_tenant_days,
          expected_tenant_days,
          paid_last_week,
          paid_today: paid_today_val,
          paid_yesterday,
          yesterday_response_pct,
          today_response_pct,
          effective_daily_pct,
          daily_status,
          daily_rating,
          can_post_rent_today,
          expected_daily: dailyExpected,
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