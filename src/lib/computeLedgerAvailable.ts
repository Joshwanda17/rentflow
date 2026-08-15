import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the user's TRUE withdrawable balance using the strict
 * ledger-only `get_user_wallet_view` RPC. End-user wallet UIs MUST NOT
 * read `wallets.balance` / `wallets.withdrawable_balance` directly —
 * those are operator-only caches that can drift above the ledger.
 *
 * The returned `withdrawableCached` field is kept for API compatibility
 * with existing callers but now mirrors `available` exactly (no drift
 * possible). `ledgerNet` reflects the raw ledger net used internally.
 *
 * Throws on RPC failure (timeout, transient network, expired token)
 * instead of returning a fabricated `0`. A failed read is UNKNOWN, not
 * verified-zero — callers (WithdrawFlow) already treat a thrown/null
 * result as "can't verify" and fall back to the last-known wallet
 * figure rather than blocking the user with a fake "Available: UGX 0".
 * See: Withdraw_Available_Zero_2026-08-15 incident (Gloria Namatovu).
 */
export async function computeLedgerAvailable(userId: string): Promise<{
  available: number;
  ledgerNet: number;
  withdrawableCached: number;
  pendingHolds: number;
}> {
  const { data, error } = await supabase.rpc('get_user_wallet_view', {
    p_user_id: userId,
  });
  if (error) {
    throw new Error(`computeLedgerAvailable: get_user_wallet_view failed — ${error.message}`);
  }
  const row = (data ?? {}) as {
    withdrawable?: number | string;
    pending_holds?: number | string;
  };
  const available = Number(row.withdrawable ?? 0);
  const pendingHolds = Number(row.pending_holds ?? 0);
  // ledgerNet is just available + pending_holds (pre-hold figure) for diagnostics.
  const ledgerNet = available + pendingHolds;
  // For backwards compat: callers reading `withdrawableCached` now see the
  // strict figure too — there is no separate cached value to expose.
  return { available, ledgerNet, withdrawableCached: available, pendingHolds };
}
