import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type FunderApprovalStatus = 'approved' | 'pending' | 'rejected' | 'none';

export interface FunderApprovalState {
  status: FunderApprovalStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  isApproved: boolean;
  isLoading: boolean;
}

/**
 * Reads the Partner Ops / COO approval state for a given funder.
 *
 * Source of truth: `proxy_agent_assignments` rows where beneficiary_role='supporter'.
 * A self-pending row is auto-created by a DB trigger the moment a user becomes
 * a supporter, so every funder always has at least one row.
 *
 * Used to gate:
 *  - Funder dashboard "Support Tenant" buttons
 *  - COO / Partner Ops `CreateInvestmentAccountDialog`
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
    isApproved: data?.status === 'approved',
    isLoading,
  };
}