import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Read-only notification layer for the CFO dashboard.
 *
 * Counts items already sitting in each queue's existing ready-for-CFO status —
 * exactly the same filters the corresponding panels use, so the badge always
 * matches what the CFO will actually see after jumping to the tab:
 *  - ROI Requests: pending_wallet_operations, category 'roi_payout', status 'coo_approved'
 *  - Rent Disbursements: rent_requests with status 'coo_approved'
 *  - Agent Advance Requests: agent_advance_requests pending / agent_ops_approved
 *  - Business Advances: business_advances status 'coo_approved'
 *  - Credit Access Draws: credit_access_draws status 'pending_cfo'
 *  - Allocation Returns / Unfunding: pending agent requests
 *  - Merchant Float Requests: float_requests status 'pending'
 *  - Agent Requisitions: pending_wallet_operations category 'agent_requisition', status 'pending'
 *  - Partner Top-ups: pending_wallet_operations operation_type 'portfolio_topup', status 'pending'
 *  - Director / Employee Requisitions: status 'pending'
 *  - Wallet Withdrawals: withdrawal_requests status 'pending'
 *
 * No approval logic is duplicated here — counts only. Kept live via realtime
 * so the badge falls away as soon as items are approved/rejected/cancelled.
 */
export type CfoApprovalNotificationKey =
  | 'roi'
  | 'rent'
  | 'agentAdvances'
  | 'businessAdvances'
  | 'creditDraws'
  | 'allocationReturns'
  | 'unfunding'
  | 'merchantFloat'
  | 'agentRequisitions'
  | 'partnerTopups'
  | 'directorRequisitions'
  | 'employeeRequisitions'
  | 'withdrawals';

export interface CfoApprovalNotification {
  key: CfoApprovalNotificationKey;
  title: string;
  count: number;
  tabId: string;
}

const countOf = (res: { count: number | null; error: unknown }) =>
  res.error ? 0 : res.count ?? 0;

export function useCfoApprovalNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['cfo-approval-notifications'],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const head = { count: 'exact' as const, head: true };
      const [
        roi,
        rent,
        agentAdvances,
        businessAdvances,
        creditDraws,
        allocationReturns,
        unfunding,
        merchantFloat,
        agentRequisitions,
        partnerTopups,
        directorRequisitions,
        employeeRequisitions,
        withdrawals,
      ] = await Promise.all([
        supabase
          .from('pending_wallet_operations')
          .select('id', head)
          .eq('category', 'roi_payout')
          .eq('status', 'coo_approved'),
        supabase.from('rent_requests').select('id', head).eq('status', 'coo_approved'),
        supabase
          .from('agent_advance_requests')
          .select('id', head)
          .in('status', ['pending', 'agent_ops_approved']),
        (supabase as any)
          .from('business_advances')
          .select('id', head)
          .eq('status', 'coo_approved'),
        supabase.from('credit_access_draws').select('id', head).eq('status', 'pending_cfo'),
        (supabase as any)
          .from('agent_allocation_return_requests')
          .select('id', head)
          .eq('status', 'pending'),
        supabase.from('agent_unfunding_requests').select('id', head).eq('status', 'pending'),
        supabase.from('float_requests').select('id', head).eq('status', 'pending'),
        supabase
          .from('pending_wallet_operations')
          .select('id', head)
          .eq('category', 'agent_requisition')
          .eq('status', 'pending'),
        supabase
          .from('pending_wallet_operations')
          .select('id', head)
          .eq('operation_type', 'portfolio_topup')
          .eq('status', 'pending'),
        supabase.from('director_requisitions').select('id', head).eq('status', 'pending'),
        supabase.from('employee_requisitions').select('id', head).eq('status', 'pending'),
        supabase.from('withdrawal_requests').select('id', head).eq('status', 'pending'),
      ]);
      if (roi.error) throw roi.error;
      if (rent.error) throw rent.error;
      return {
        roi: roi.count ?? 0,
        rent: rent.count ?? 0,
        agentAdvances: countOf(agentAdvances),
        businessAdvances: countOf(businessAdvances),
        creditDraws: countOf(creditDraws),
        allocationReturns: countOf(allocationReturns),
        unfunding: countOf(unfunding),
        merchantFloat: countOf(merchantFloat),
        agentRequisitions: countOf(agentRequisitions),
        partnerTopups: countOf(partnerTopups),
        directorRequisitions: countOf(directorRequisitions),
        employeeRequisitions: countOf(employeeRequisitions),
        withdrawals: countOf(withdrawals),
      };
    },
  });

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['cfo-approval-notifications'] });
    };
    const tables = [
      'pending_wallet_operations',
      'rent_requests',
      'agent_advance_requests',
      'business_advances',
      'credit_access_draws',
      'agent_allocation_return_requests',
      'agent_unfunding_requests',
      'float_requests',
      'director_requisitions',
      'employee_requisitions',
      'withdrawal_requests',
    ];
    let channel = supabase.channel('cfo-approval-notifications');
    tables.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        invalidate,
      );
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const counts = {
    roi: query.data?.roi ?? 0,
    rent: query.data?.rent ?? 0,
    agentAdvances: query.data?.agentAdvances ?? 0,
    businessAdvances: query.data?.businessAdvances ?? 0,
    creditDraws: query.data?.creditDraws ?? 0,
    allocationReturns: query.data?.allocationReturns ?? 0,
    unfunding: query.data?.unfunding ?? 0,
    merchantFloat: query.data?.merchantFloat ?? 0,
    agentRequisitions: query.data?.agentRequisitions ?? 0,
    partnerTopups: query.data?.partnerTopups ?? 0,
    directorRequisitions: query.data?.directorRequisitions ?? 0,
    employeeRequisitions: query.data?.employeeRequisitions ?? 0,
    withdrawals: query.data?.withdrawals ?? 0,
  } satisfies Record<CfoApprovalNotificationKey, number>;

  const definitions: { key: CfoApprovalNotificationKey; title: string; tabId: string }[] = [
    { key: 'roi', title: 'ROI Requests Awaiting Approval', tabId: 'roi-requests' },
    { key: 'rent', title: 'Rent Disbursements Awaiting Approval', tabId: 'landlord-payout-float' },
    { key: 'agentAdvances', title: 'Agent Advance Requests Awaiting Approval', tabId: 'advances' },
    { key: 'businessAdvances', title: 'Business Advances Awaiting Disbursement', tabId: 'advances' },
    { key: 'creditDraws', title: 'Credit Access Draws Awaiting Approval', tabId: 'wallet-payout' },
    { key: 'allocationReturns', title: 'Allocation Returns Awaiting Approval', tabId: 'unfunding-approvals' },
    { key: 'unfunding', title: 'Unfunding Requests Awaiting Approval', tabId: 'unfunding-approvals' },
    { key: 'merchantFloat', title: 'Merchant Float Requests Awaiting Approval', tabId: 'merchant-float' },
    { key: 'agentRequisitions', title: 'Agent Requisitions Awaiting Approval', tabId: 'agent-requisitions' },
    { key: 'partnerTopups', title: 'Partner Top-ups Awaiting Verification', tabId: 'partner-topups' },
    { key: 'directorRequisitions', title: 'Director Requisitions Awaiting Approval', tabId: 'requisitions' },
    { key: 'employeeRequisitions', title: 'Employee Requisitions Awaiting Approval', tabId: 'employee-requisitions' },
    { key: 'withdrawals', title: 'Wallet Withdrawals Awaiting Approval', tabId: 'withdrawals' },
  ];

  const notifications: CfoApprovalNotification[] = definitions
    .map((d) => ({ ...d, count: counts[d.key] }))
    .filter((n) => n.count > 0);

  return {
    isLoading: query.isLoading,
    roiCount: counts.roi,
    rentCount: counts.rent,
    counts,
    total: notifications.reduce((sum, n) => sum + n.count, 0),
    notifications,
  };
}
