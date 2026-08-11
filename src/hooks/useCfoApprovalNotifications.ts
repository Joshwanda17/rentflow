import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Read-only notification layer for the CFO dashboard.
 *
 * Counts items already sitting in the system's existing ready-for-CFO status:
 *  - ROI Requests: pending_wallet_operations, category 'roi_payout', status 'coo_approved'
 *    (exactly what CFOROIRequests lists by default).
 *  - Rent Disbursements: rent_requests with status 'coo_approved'
 *    (exactly what RentDisbursementQueue lists).
 *
 * No approval logic is duplicated here — counts only. Kept live via realtime
 * so the badge falls away as soon as items are approved/rejected/cancelled.
 */
export interface CfoApprovalNotification {
  key: 'roi' | 'rent';
  title: string;
  count: number;
  tabId: string;
}

export function useCfoApprovalNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['cfo-approval-notifications'],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [roi, rent] = await Promise.all([
        supabase
          .from('pending_wallet_operations')
          .select('id', { count: 'exact', head: true })
          .eq('category', 'roi_payout')
          .eq('status', 'coo_approved'),
        supabase
          .from('rent_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'coo_approved'),
      ]);
      if (roi.error) throw roi.error;
      if (rent.error) throw rent.error;
      return { roi: roi.count ?? 0, rent: rent.count ?? 0 };
    },
  });

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['cfo-approval-notifications'] });
    };
    const channel = supabase
      .channel('cfo-approval-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_wallet_operations' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rent_requests' }, invalidate)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const roiCount = query.data?.roi ?? 0;
  const rentCount = query.data?.rent ?? 0;

  const notifications: CfoApprovalNotification[] = [
    { key: 'roi', title: 'ROI Requests Awaiting Approval', count: roiCount, tabId: 'roi-requests' },
    { key: 'rent', title: 'Rent Disbursements Awaiting Approval', count: rentCount, tabId: 'landlord-payout-float' },
  ].filter((n) => n.count > 0) as CfoApprovalNotification[];

  return {
    isLoading: query.isLoading,
    roiCount,
    rentCount,
    total: roiCount + rentCount,
    notifications,
  };
}
