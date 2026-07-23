import { useOpsWallet, type OpsWallet } from '@/hooks/ops/useOpsDataLayer';

/**
 * DEPRECATED alias — please import `useOpsWallet` from
 * `@/hooks/ops/useOpsDataLayer` in new code.
 *
 * Kept as a thin wrapper so the ~30 existing call sites keep working while
 * we migrate them incrementally. Under the hood this now shares the same
 * React Query cache entry (`['ops','wallet', userId]`) as `useOpsWallet`,
 * so every subscriber across the app dedupes into a single request per
 * user per 8s window — no more N-callers-per-screen wallet reads.
 */
export type AuthoritativeWallet = OpsWallet;

export function useAuthoritativeWalletBalance(userId: string | null | undefined) {
  return useOpsWallet(userId);
}