import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the user's TRUE withdrawable balance computed from the ledger,
 * independent of any cached `wallets.withdrawable_balance` snapshot and
 * independent of `get_user_available_balance` RPC (which has historically
 * been broken). Result is clamped to the wallet's withdrawable bucket so
 * float / advance can never fund a payout, and pending withdrawal requests
 * are subtracted so the same money can't be queued twice.
 */
export async function computeLedgerAvailable(userId: string): Promise<{
  available: number;
  ledgerNet: number;
  withdrawableCached: number;
  pendingHolds: number;
}> {
  const [walletRes, ledgerRes, pendingRes] = await Promise.all([
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

  const available = Math.max(0, Math.min(withdrawableCached, ledgerNet) - pendingHolds);
  return { available, ledgerNet, withdrawableCached, pendingHolds };
}
