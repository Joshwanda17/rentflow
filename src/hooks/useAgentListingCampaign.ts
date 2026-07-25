import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AgentListingCampaign {
  week_start: string;
  week_end: string;
  days_remaining: number;
  invited_count: number;
  invited_target: number;
  activated_count: number;
  activated_target: number;
  verified_houses_count: number;
  verified_houses_target: number;
  house_commission: number;
  commission_earned: number;
  bonus_amount: number;
  bonus_earned: number;
  bonus_eligible: boolean;
  total_potential: number;
  total_earned: number;
  still_available: number;
}

/**
 * Weekly Agent Listing Campaign progress for the given agent.
 * Reads real current-week data (invited sub-agents, activated sub-agents,
 * verified houses, commission + bonus earned) from the backend RPC.
 *
 * When the agent has met the full target and the UGX 40,000 bonus has not yet
 * been awarded, it self-awards once (idempotent server-side) and refetches.
 */
export function useAgentListingCampaign(agentId?: string) {
  const queryClient = useQueryClient();
  const awardingRef = useRef(false);

  const query = useQuery({
    queryKey: ['agent-listing-campaign', agentId],
    enabled: !!agentId,
    staleTime: 60_000,
    queryFn: async (): Promise<AgentListingCampaign | null> => {
      if (!agentId) return null;
      const { data, error } = await (supabase.rpc as any)('get_agent_listing_campaign', {
        p_agent_id: agentId,
      });
      if (error) throw error;
      return data as AgentListingCampaign;
    },
  });

  const campaign = query.data;

  // Auto-award the completion bonus once the target is met.
  useEffect(() => {
    if (!agentId || !campaign) return;
    if (!campaign.bonus_eligible) return;
    if (campaign.bonus_earned > 0) return;
    if (awardingRef.current) return;
    awardingRef.current = true;
    (async () => {
      try {
        const { data } = await (supabase.rpc as any)('award_agent_listing_campaign_bonus', {
          p_agent_id: agentId,
        });
        if (data?.status === 'awarded' || data?.status === 'already_awarded') {
          await queryClient.invalidateQueries({ queryKey: ['agent-listing-campaign', agentId] });
        }
      } catch {
        // ignore — server re-checks eligibility, safe to retry next load
      } finally {
        awardingRef.current = false;
      }
    })();
  }, [agentId, campaign?.bonus_eligible, campaign?.bonus_earned, queryClient, campaign]);

  return {
    campaign,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
