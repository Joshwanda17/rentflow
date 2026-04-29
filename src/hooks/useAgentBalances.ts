import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWalletRealtime } from '@/hooks/useWalletRealtime';
import { computeLedgerAvailable } from '@/lib/computeLedgerAvailable';

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

      // Read wallet buckets + true commission earnings ledger in parallel.
      // Do not include referral bonuses or legacy proxy investment entries here:
      // those are not earned agent commission, and old ghost/back-fill rows can
      // otherwise resurface in the dashboard after the wallet has been zeroed.
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

      // Compute true commission balance by NETTING in vs out per row.
      // CRITICAL: legacy ghost/back-fill data sometimes contains a paired
      // entry where the SAME category (e.g. 'agent_commission_earned') has
      // both a cash_in AND a matching cash_out on the wallet scope —
      // economically a no-op, but a one-sided "credits only" sum surfaces
      // it as a phantom commission balance. SSENKAALI PIUS (2026-04-27):
      // 5,600,000 cash_in + 5,600,000 cash_out of agent_commission_earned
      // → wallet correctly reads 0, but dashboard showed 5,600,000.
      // Net every row instead.
      let commissionBalance = 0;
      if (!commissionRes.error && commissionRes.data) {
        for (const row of commissionRes.data as any[]) {
          const amt = Number(row.amount) || 0;
          const isIn = row.direction === 'cash_in' || row.direction === 'credit';
          const isOut = row.direction === 'cash_out' || row.direction === 'debit';
          if (isIn) commissionBalance += amt;
          else if (isOut) commissionBalance -= amt;
        }
        commissionBalance = Math.max(0, commissionBalance);
      } else if (commissionRes.error) {
        console.warn('[useAgentBalances] commission ledger error (non-fatal):', commissionRes.error);
        commissionBalance = rawWithdrawable; // fallback to legacy behavior
      }

      // STRICT LEDGER-BACKED WITHDRAWABLE.
      // The only number the user is allowed to see as "withdrawable" is what
      // the server-side gate (`get_user_available_balance`) will allow. We do
      // NOT fall back to the cached wallet bucket, because that bucket can
      // sit above the ledger position (phantom drift, missing legacy posts).
      // If the RPC fails, we conservatively use min(cache, ledger_net_now)
      // computed from the ledger directly — never the raw cache.
      let withdrawableBalance = 0;
      try {
        const ledger = await computeLedgerAvailable(effectiveId);
        withdrawableBalance = Math.max(0, Math.min(ledger.available, rawWithdrawable));
      } catch (e) {
        console.warn('[useAgentBalances] ledger-true clamp failed, defaulting to 0', e);
        withdrawableBalance = 0;
      }
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
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 30_000,
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
