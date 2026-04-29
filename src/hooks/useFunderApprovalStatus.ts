import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type FunderApprovalStatus = 'approved' | 'pending' | 'rejected' | 'none';

export interface FunderApprovalState {
  status: FunderApprovalStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  /**
   * Whether the user can fund their OWN pool / back portfolios for themselves.
   *
   * Self-funding is an inherent right of any authenticated Supporter and must
   * NEVER be gated by `proxy_agent_assignments.status`. That row only governs
   * whether the user can act on behalf of OTHER funders (proxy authority).
   *
   * Always `true` here. Use `useProxyAuthority` for proxy-only surfaces.
   */
  isApproved: boolean;
  isLoading: boolean;
}

/**
 * Reads the Partner Ops / COO proxy assignment state for a user.
 * Source: `proxy_agent_assignments` (beneficiary_role='supporter').
 *
 * IMPORTANT: This represents PROXY AUTHORITY, NOT permission to fund one's
 * own pool. Self-funding is always allowed for authenticated Supporters.
 */
export function useFunderApprovalStatus(userId: string | null | undefined): FunderApprovalState {
  const { data, isLoading } = useQuery({
    queryKey: ['funder-approval-status', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_funder_approval_status', {
        _user_id: userId as string,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        status: ((row?.status as FunderApprovalStatus) || 'none'),
        rejectionReason: (row?.rejection_reason as string | null) ?? null,
        approvedAt: (row?.approved_at as string | null) ?? null,
      };
    },
  });

  return {
    status: data?.status ?? 'none',
    rejectionReason: data?.rejectionReason ?? null,
    approvedAt: data?.approvedAt ?? null,
    // Self-funding is always allowed; proxy status never gates it.
    isApproved: true,
    isLoading,
  };
}

/**
 * Proxy authority: can this user act on behalf of OTHER funders?
 * Use ONLY in proxy-management surfaces (deposit on behalf of a managed
 * funder, claim partner commission, "Funders I manage" tab).
 */
export function useProxyAuthority(userId: string | null | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ['proxy-authority-status', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_funder_approval_status', {
        _user_id: userId as string,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        status: ((row?.status as FunderApprovalStatus) || 'none'),
        rejectionReason: (row?.rejection_reason as string | null) ?? null,
      };
    },
  });

  return {
    status: data?.status ?? 'none',
    rejectionReason: data?.rejectionReason ?? null,
    hasProxyAuthority: data?.status === 'approved',
    isLoading,
  };
}
