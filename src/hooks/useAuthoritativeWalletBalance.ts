import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Single source of truth for wallet balances anywhere in the app.
 *
 * Backed by the SQL view `v_user_wallet_strict` via the
 * `get_authoritative_wallet(user_id)` RPC. Every card, report, PDF, withdrawal
 * gate and CFO panel MUST consume this hook (or the same RPC on the server)
 * instead of reading `wallets.*_balance` directly. That guarantees every screen
 * shows the same number for the same wallet.
 */
export interface AuthoritativeWallet {
  userId: string;
  withdrawable: number;
  float: number;
  advance: number;
  pendingHolds: number;
  cache: { withdrawable: number; float: number; advance: number };
  drift: { withdrawable: number; float: number; advance: number };
}

export function useAuthoritativeWalletBalance(userId: string | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['authoritative-wallet', userId],
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async (): Promise<AuthoritativeWallet | null> => {
      if (!userId) return null;
      const { data, error } = await supabase.rpc('get_authoritative_wallet', { p_user_id: userId });
      if (error) throw error;
      const d: any = data ?? {};
      return {
        userId,
        withdrawable: Number(d.withdrawable) || 0,
        float: Number(d.float) || 0,
        advance: Number(d.advance) || 0,
        pendingHolds: Number(d.pending_holds) || 0,
        cache: {
          withdrawable: Number(d.cache?.withdrawable) || 0,
          float: Number(d.cache?.float) || 0,
          advance: Number(d.cache?.advance) || 0,
        },
        drift: {
          withdrawable: Number(d.drift?.withdrawable) || 0,
          float: Number(d.drift?.float) || 0,
          advance: Number(d.drift?.advance) || 0,
        },
      };
    },
  });

  // Live refresh: any new ledger row for this user triggers a refetch, so every
  // subscriber sees the same balance within a second of a mutation.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`authoritative-wallet-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'general_ledger', filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['authoritative-wallet', userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return query;
}