/**
 * useAvailableBalance — UI truth for "what can the user actually move".
 *
 * Sources strictly from `get_user_wallet_view`, which derives every bucket
 * live from `general_ledger`. The cached `wallets.*` columns are operator-
 * only (CFO/FinOps reconciliation) and are never read here.
 *
 * `walletCached` is retained for API compatibility; it now equals
 * `available + pendingHolds` (the pre-hold strict figure) so callers that
 * previously rendered "Wallet total" still get a sensible number that can
 * never exceed what the user is allowed to move.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AvailableBalance {
  available: number;
  walletCached: number;
  ledgerNet: number;
  hasDrift: boolean;
  restrictedHeld: number;
}

export function useAvailableBalance(userId?: string) {
  const { user } = useAuth();
  const targetId = userId ?? user?.id;
  const [data, setData] = useState<AvailableBalance | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      const { data: row, error } = await supabase.rpc('get_user_wallet_view', {
        p_user_id: targetId,
      });
      if (error) throw error;
      const r = (row ?? {}) as Record<string, unknown>;
      const available = Number((r.withdrawable as number | string | undefined) ?? 0);
      const pendingHolds = Number((r.pending_holds as number | string | undefined) ?? 0);
      const restrictedHeld = Number((r.restricted_held as number | string | undefined) ?? 0);
      const walletCached = available + pendingHolds + restrictedHeld; // pre-hold strict figure
      const ledgerNet = walletCached;
      setData({
        available,
        walletCached,
        ledgerNet,
        hasDrift: pendingHolds > 0,
        restrictedHeld,
      });
    } catch {
      // Soft-fail: leave previous value in place. We never want this hook
      // to crash the wallet card.
    } finally {
      setLoading(false);
    }
  }, [targetId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live-refresh on wallet bucket changes, ledger inserts, or withdrawal
  // request lifecycle changes. This keeps the wallet card honest the moment
  // a user submits a withdrawal request — without a hard reload.
  useEffect(() => {
    if (!targetId) return;
    const channel = supabase
      .channel(`available-bal-${targetId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${targetId}` },
        () => { void refresh(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'withdrawal_requests', filter: `user_id=eq.${targetId}` },
        () => { void refresh(); },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'general_ledger', filter: `user_id=eq.${targetId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [targetId, refresh]);

  return { ...(data ?? { available: 0, walletCached: 0, ledgerNet: 0, hasDrift: false, restrictedHeld: 0 }), loading, refresh };
}