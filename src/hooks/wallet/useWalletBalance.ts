/**
 * useWalletBalance — CANONICAL wallet hook.
 *
 * Every component that displays a wallet balance (card, hero, dialog,
 * statement, drawer, statistics) MUST use this hook. It reads
 * `get_user_wallet_view` (strict, ledger-derived — the same source the
 * ledger statement uses), so the wallet card and the ledger can never
 * show different numbers.
 *
 * The hook does NOT cache wallet balances across time. It uses React
 * Query only to DEDUPE concurrent in-flight requests for the same user:
 * if 5 components mount at the same instant and each asks for user X's
 * wallet, they share ONE network round-trip. Data is not persisted
 * beyond active subscribers.
 *
 *   staleTime: 0    — any new subscriber past the concurrent tick refetches
 *   gcTime: 0       — data is discarded the moment no component consumes it
 *   refetchOnWindowFocus: false   — money reads never fire on tab focus
 *   refetchOnReconnect: false     — realtime handles freshness after reconnect
 *   refetchInterval: undefined    — no polling; realtime pushes invalidations
 *
 * Realtime channels (wallets_physical / general_ledger / withdrawal_requests
 * / wallet_transactions for the user) are ref-counted per userId so N
 * subscribers on the same page share ONE channel.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { trackRequest } from "@/lib/costMonitor";

export interface WalletBalanceView {
  userId: string;
  /** Withdrawable (transferable) balance, strict from ledger, holds subtracted. */
  withdrawable: number;
  /** Operational float — company money, never transferable/withdrawable. */
  floatBalance: number;
  /** Liability owed back to platform. Not spendable. */
  advanceBalance: number;
  /** In-flight withdrawal holds already subtracted from `withdrawable`. */
  pendingHolds: number;
  /** Restricted / held funds surfaced from the RPC. */
  restrictedHeld: number;
  /** Convenience total (withdrawable + float) — matches legacy `wallet.balance`. */
  totalVisible: number;
  updatedAt: string | null;
}

export const walletBalanceKey = (userId: string | null | undefined) =>
  ["wallet-view", userId ?? ""] as const;

const EMPTY: Omit<WalletBalanceView, "userId"> = {
  withdrawable: 0,
  floatBalance: 0,
  advanceBalance: 0,
  pendingHolds: 0,
  restrictedHeld: 0,
  totalVisible: 0,
  updatedAt: null,
};

export async function fetchWalletBalance(userId: string): Promise<WalletBalanceView> {
  trackRequest("db", "get_user_wallet_view");
  const { data, error } = await supabase.rpc("get_user_wallet_view", { p_user_id: userId });
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  const withdrawable = Number((d.withdrawable as number | string | undefined) ?? 0);
  const floatBalance = Number((d.float_balance as number | string | undefined) ?? 0);
  const advanceBalance = Number((d.advance_balance as number | string | undefined) ?? 0);
  const pendingHolds = Number((d.pending_holds as number | string | undefined) ?? 0);
  const restrictedHeld = Number((d.restricted_held as number | string | undefined) ?? 0);
  const totalVisibleFromRpc = Number((d.total_visible as number | string | undefined) ?? NaN);
  return {
    userId,
    withdrawable,
    floatBalance,
    advanceBalance,
    pendingHolds,
    restrictedHeld,
    totalVisible: Number.isFinite(totalVisibleFromRpc)
      ? totalVisibleFromRpc
      : withdrawable + floatBalance,
    updatedAt: (d.updated_at as string | undefined) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ref-counted realtime channels — one channel per userId, shared across
// every hook subscriber for that user.
// ---------------------------------------------------------------------------

type ChannelEntry = {
  channel: ReturnType<typeof supabase.channel>;
  refCount: number;
};
const activeChannels = new Map<string, ChannelEntry>();

function acquireChannel(userId: string, qc: QueryClient) {
  const existing = activeChannels.get(userId);
  if (existing) {
    existing.refCount += 1;
    return;
  }
  const invalidate = () => qc.invalidateQueries({ queryKey: walletBalanceKey(userId) });
  const channel = supabase
    .channel(`wallet-view-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "wallets_physical", filter: `user_id=eq.${userId}` },
      invalidate,
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "general_ledger", filter: `user_id=eq.${userId}` },
      invalidate,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "withdrawal_requests", filter: `user_id=eq.${userId}` },
      invalidate,
    )
    .subscribe();
  activeChannels.set(userId, { channel, refCount: 1 });
}

function releaseChannel(userId: string) {
  const entry = activeChannels.get(userId);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    supabase.removeChannel(entry.channel);
    activeChannels.delete(userId);
  }
}

/**
 * Read the strict wallet view for `userId`.
 *
 * Every subscriber on the same page/tick dedupes into ONE round-trip.
 * No cross-session cache. Realtime keeps balances fresh; mutations should
 * additionally call `invalidateWalletBalance(qc, userId)` on success.
 */
export function useWalletBalance(userId: string | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery<WalletBalanceView>({
    queryKey: walletBalanceKey(userId),
    enabled: !!userId,
    queryFn: () => fetchWalletBalance(userId as string),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  useEffect(() => {
    if (!userId) return;
    acquireChannel(userId, qc);
    return () => releaseChannel(userId);
  }, [userId, qc]);

  const value: WalletBalanceView = query.data ?? { userId: userId ?? "", ...EMPTY };
  return {
    ...value,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Call from every financial mutation's onSuccess. */
export function invalidateWalletBalance(qc: QueryClient, userId: string | null | undefined) {
  if (!userId) return;
  qc.invalidateQueries({ queryKey: walletBalanceKey(userId) });
}