import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWalletRealtime } from '@/hooks/useWalletRealtime';

export interface AgentSplitBalances {
  withdrawableBalance: number;
  floatBalance: number;
  advanceBalance: number;
  /** True commission balance: sum(agent_commission_earned cash_in) − sum(commission cash_out). Always ≥ 0. */
  commissionBalance: number;
  /** Withdrawable funds NOT classified as commission (e.g. CFO admin-expense credits). Review with CFO. */
  otherBalance: number;
  totalBalance: number;
}

export function useAgentBalances(agentId?: string) {
  const { user } = useAuth();
  const effectiveId = agentId || user?.id;

  // Live-update balances the moment wallets / deductions / ledger change for this user.
  useWalletRealtime(effectiveId);

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
            'agent_commission',
            'agent_bonus',
            'agent_commission_withdrawal',
            'agent_commission_used_for_rent',
            'partner_commission',
            'referral_bonus',
            'proxy_investment_commission',
          ]),
      ]);

      if (walletRes.error) {
        console.error('[useAgentBalances] wallet error:', walletRes.error);
        throw walletRes.error;
      }

      const wallet = walletRes.data as any;
      const rawWithdrawable = Number(wallet?.withdrawable_balance ?? 0);
      const floatBalance = Number(wallet?.float_balance ?? 0);
      const advanceBalance = Number(wallet?.advance_balance ?? 0);

      // Compute true commission balance: earned - withdrawn/spent
      let commissionBalance = 0;
      if (!commissionRes.error && commissionRes.data) {
        for (const row of commissionRes.data as any[]) {
          const amt = Number(row.amount) || 0;
          const isIn = row.direction === 'cash_in' || row.direction === 'credit';
          const isOut = row.direction === 'cash_out' || row.direction === 'debit';
          if (isIn && (
            row.category === 'agent_commission_earned' ||
            row.category === 'agent_commission' ||
            row.category === 'agent_bonus' ||
            row.category === 'partner_commission' ||
            row.category === 'referral_bonus' ||
            row.category === 'proxy_investment_commission'
          )) {
            commissionBalance += amt;
          } else if (isOut && (row.category === 'agent_commission_withdrawal' || row.category === 'agent_commission_used_for_rent')) {
            commissionBalance -= amt;
          }
        }
        commissionBalance = Math.max(0, commissionBalance);
      } else if (commissionRes.error) {
        console.warn('[useAgentBalances] commission ledger error (non-fatal):', commissionRes.error);
        commissionBalance = rawWithdrawable; // fallback to legacy behavior
      }

      // Withdrawable balance is the truth from the wallet row (what the user can actually
      // cash out). Commission balance is ledger-derived (what they earned). The gap is
      // "other" — typically CFO admin-expense credits that landed in withdrawable but
      // aren't earnings.
      const withdrawableBalance = rawWithdrawable;
      const otherBalance = Math.max(0, rawWithdrawable - commissionBalance);
      // After role-aware routing fix (2026-04-23), withdrawable should equal commission balance
      // for agents. Any drift means a non-commission credit landed in withdrawable — log so we
      // can catch missed categories in the router, but don't alarm the user.
      if (otherBalance > 1) {
        console.info(
          '[useAgentBalances] withdrawable/commission drift (non-commission funds in withdrawable)',
          { agentId: effectiveId, rawWithdrawable, commissionBalance, otherBalance }
        );
      }

      return {
        withdrawableBalance,
        floatBalance,
        advanceBalance,
        commissionBalance,
        otherBalance,
        totalBalance: withdrawableBalance + floatBalance,
      };
    },
    enabled: !!effectiveId,
    // Treat balances as always-stale: the wallet is the most safety-critical
    // value the user sees. We must never gate a withdraw button on a 15s-old
    // cached zero. Realtime invalidations will still keep it fresh between
    // renders; this just stops React Query from serving a stale snapshot.
    staleTime: 0,
    gcTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
  });

  return {
    withdrawableBalance: data?.withdrawableBalance ?? 0,
    floatBalance: data?.floatBalance ?? 0,
    advanceBalance: data?.advanceBalance ?? 0,
    commissionBalance: data?.commissionBalance ?? 0,
    otherBalance: data?.otherBalance ?? 0,
    totalBalance: data?.totalBalance ?? 0,
    isLoading,
    error,
    refetch,
  };
}
