import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the user's TRUE withdrawable balance using the baseline-anchored
 * `get_user_available_balance` RPC as the source of truth. The RPC computes:
 *   available = max(0, min(withdrawable_cached,
 *                          baseline_w + (ledger_net_now - ledger_net_at_baseline))
 *                       - pending_holds)
 * which prevents both phantom money (cap by withdrawable bucket) AND
 * retroactive over-crediting from all-time ledger drift (cap by baseline + delta).
 * We still surface the raw inputs for UI diagnostics.
 */
export async function computeLedgerAvailable(userId: string): Promise<{
  available: number;
  ledgerNet: number;
  withdrawableCached: number;
  pendingHolds: number;
}> {
  const [rpcRes, walletRes, ledgerRes, pendingRes] = await Promise.all([
    supabase.rpc('get_user_available_balance', { p_user_id: userId }),
    supabase
      .from('wallets')
      .select('withdrawable_balance')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('general_ledger')
      .select('amount, direction')
      .eq('user_id', userId)
      .eq('ledger_scope', 'wallet')
      .or('classification.is.null,classification.eq.production'),
    supabase
      .from('withdrawal_requests')
      .select('amount')
      .eq('user_id', userId)
      .in('status', ['pending', 'requested', 'manager_approved', 'processing']),
  ]);

  const withdrawableCached = Number((walletRes.data as any)?.withdrawable_balance ?? 0);
  const ledgerNet = (ledgerRes.data || []).reduce((acc: number, r: any) => {
    const amt = Number(r.amount) || 0;
    if (r.direction === 'cash_in') return acc + amt;
    if (r.direction === 'cash_out') return acc - amt;
    return acc;
  }, 0);
  const pendingHolds = (pendingRes.data || []).reduce(
    (sum: number, p: any) => sum + Number(p.amount || 0),
    0,
  );

  // Baseline-anchored RPC is the source of truth. Fall back to the
  // conservative min(cache, ledger) only if the RPC is unavailable.
  const rpcVal = Number((rpcRes as any)?.data ?? NaN);
  const available = Number.isFinite(rpcVal)
    ? rpcVal
    : Math.max(0, Math.min(withdrawableCached, ledgerNet) - pendingHolds);
  return { available, ledgerNet, withdrawableCached, pendingHolds };
}
