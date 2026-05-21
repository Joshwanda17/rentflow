import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to wallet-affecting tables (wallets_physical, wallet_deductions, general_ledger)
 * and invalidates the relevant React Query caches so the UI updates instantly when
 * money moves — e.g. when CFO retracts funds or a deposit/withdrawal is approved.
 *
 * Notes:
 * - `wallets` is a view; the physical, publishable table is `wallets_physical`.
 *   Reads still go through `wallets`/`get_user_wallet_view` (strict rule); we only
 *   listen on the physical table for the change stream.
 * - Invalidations are debounced (250ms) so a burst of ledger inserts that also
 *   touches the wallet row collapses into a single refetch — keeps message
 *   handling cheap at 40M-user scale.
 * - On every event we re-call the strict balance RPC via React Query
 *   invalidation. We NEVER read payload.new.* — that would reintroduce the
 *   cache-inflation bug the Withdrawable Strict Rule was built to prevent.
 *
 * Pass a userId to scope the subscription to a single user. Pass undefined to
 * listen platform-wide (useful for ops/CFO dashboards).
 */
export function useWalletRealtime(userId?: string, extraQueryKeys: string[][] = []) {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const channelName = userId ? `wallet-rt-${userId}` : 'wallet-rt-global';

    const flushInvalidate = () => {
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

    const invalidate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flushInvalidate, 250);
    };

    const walletFilter = userId ? `user_id=eq.${userId}` : undefined;
    const deductionFilter = userId ? `target_user_id=eq.${userId}` : undefined;
    const ledgerFilter = userId ? `user_id=eq.${userId}` : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        // wallets is a view; subscribe to the underlying physical table.
        { event: '*', schema: 'public', table: 'wallets_physical', ...(walletFilter ? { filter: walletFilter } : {}) },
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
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, queryClient]);
}