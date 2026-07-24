/**
 * DEPRECATED alias — new code should import `useWalletBalance` from
 * `@/hooks/wallet/useWalletBalance`.
 *
 * This wrapper preserves the legacy `OpsWallet` shape (used by ~30 call
 * sites) but now reads through the canonical wallet hook so every wallet
 * subscriber on a screen shares ONE in-flight request. The wallet card
 * and ledger cannot diverge because they read the same RPC through the
 * same query key.
 */
import { useWalletBalance } from '@/hooks/wallet/useWalletBalance';

export type AuthoritativeWallet = {
  userId: string;
  withdrawable: number;
  float: number;
  advance: number;
  pendingHolds: number;
  cache: { withdrawable: number; float: number; advance: number };
  drift: { withdrawable: number; float: number; advance: number };
};

export function useAuthoritativeWalletBalance(userId: string | null | undefined) {
  const w = useWalletBalance(userId);
  const data: AuthoritativeWallet = {
    userId: w.userId,
    withdrawable: w.withdrawable,
    float: w.floatBalance,
    advance: w.advanceBalance,
    pendingHolds: w.pendingHolds,
    // Strict view IS the authoritative source, so cache == strict and drift == 0.
    cache: { withdrawable: w.withdrawable, float: w.floatBalance, advance: w.advanceBalance },
    drift: { withdrawable: 0, float: 0, advance: 0 },
  };
  return {
    data,
    isLoading: w.isLoading,
    isFetching: w.isFetching,
    error: w.error,
    refetch: w.refetch,
  };
}