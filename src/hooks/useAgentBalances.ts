import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AgentSplitBalances {
  withdrawableBalance: number;
  floatBalance: number;
  advanceBalance: number;
  /** @deprecated Use withdrawableBalance. Kept for backward compatibility. */
  commissionBalance: number;
  totalBalance: number;
}

export function useAgentBalances(agentId?: string) {
  const { user } = useAuth();
  const effectiveId = agentId || user?.id;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['agent-split-balances', effectiveId],
    queryFn: async (): Promise<AgentSplitBalances> => {
      if (!effectiveId) throw new Error('No agent ID available');

      // Read wallet buckets + commission earnings ledger in parallel
      const [walletRes, commissionRes] = await Promise.all([
        supabase
          .from('wallets')
          .select('withdrawable_balance, float_balance, advance_balance, balance')
          .eq('user_id', effectiveId)
          .maybeSingle(),
        supabase
          .from('general_ledger')
          .select('amount, direction, category')
          .eq('user_id', effectiveId)
          .eq('ledger_scope', 'wallet')
          .in('category', [
            'agent_commission_earned',
            'agent_commission_withdrawal',
            'agent_commission_used_for_rent',
            'partner_commission',
            'referral_bonus',
          ]),
      ]);

      if (walletRes.error) {
        console.error('[useAgentBalances] wallet error:', walletRes.error);
        throw walletRes.error;
      }

      const wallet = walletRes.data as any;
      const withdrawableBalance = Number(wallet?.withdrawable_balance ?? 0);
      const floatBalance = Number(wallet?.float_balance ?? 0);
      const advanceBalance = Number(wallet?.advance_balance ?? 0);

      // Compute true commission balance: earned - withdrawn/spent
      let commissionBalance = 0;
      if (!commissionRes.error && commissionRes.data) {
        for (const row of commissionRes.data as any[]) {
          const amt = Number(row.amount) || 0;
          const isIn = row.direction === 'cash_in' || row.direction === 'credit';
          const isOut = row.direction === 'cash_out' || row.direction === 'debit';
          if (isIn && (row.category === 'agent_commission_earned' || row.category === 'partner_commission' || row.category === 'referral_bonus')) {
            commissionBalance += amt;
          } else if (isOut && (row.category === 'agent_commission_withdrawal' || row.category === 'agent_commission_used_for_rent')) {
            commissionBalance -= amt;
          }
        }
        commissionBalance = Math.max(0, commissionBalance);
      } else if (commissionRes.error) {
        console.warn('[useAgentBalances] commission ledger error (non-fatal):', commissionRes.error);
        commissionBalance = withdrawableBalance; // fallback to legacy behavior
      }

      return {
        withdrawableBalance,
        floatBalance,
        advanceBalance,
        commissionBalance,
        totalBalance: withdrawableBalance + floatBalance,
      };
    },
    enabled: !!effectiveId,
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
  });

  return {
    withdrawableBalance: data?.withdrawableBalance ?? 0,
    floatBalance: data?.floatBalance ?? 0,
    advanceBalance: data?.advanceBalance ?? 0,
    commissionBalance: data?.commissionBalance ?? 0,
    totalBalance: data?.totalBalance ?? 0,
    isLoading,
    error,
    refetch,
  };
}
