import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to wallet-affecting tables (wallets, wallet_deductions, general_ledger)
 * and invalidates the relevant React Query caches so the UI updates instantly when
 * money moves — e.g. when CFO retracts funds or a deposit/withdrawal is approved.
 *
 * Pass a userId to scope the subscription to a single user. Pass undefined to
 * listen platform-wide (useful for ops/CFO dashboards).
 */
export function useWalletRealtime(userId?: string, extraQueryKeys: string[][] = []) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channelName = userId ? `wallet-rt-${userId}` : 'wallet-rt-global';

    const invalidate = () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['agent-split-balances', userId] });
        queryClient.invalidateQueries({ queryKey: ['wallet', userId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['agent-split-balances'] });
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
      }
      queryClient.invalidateQueries({ queryKey: ['cfo-wallet-deductions'] });
      extraQueryKeys.forEach((k) => queryClient.invalidateQueries({ queryKey: k }));
    };

    const walletFilter = userId ? `user_id=eq.${userId}` : undefined;
    const deductionFilter = userId ? `target_user_id=eq.${userId}` : undefined;
    const ledgerFilter = userId ? `user_id=eq.${userId}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallets', ...(walletFilter ? { filter: walletFilter } : {}) },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_deductions', ...(deductionFilter ? { filter: deductionFilter } : {}) },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'general_ledger', ...(ledgerFilter ? { filter: ledgerFilter } : {}) },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, queryClient]);
}