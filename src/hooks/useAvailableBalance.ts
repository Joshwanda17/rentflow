/**
 * useAvailableBalance — UI truth for "what can the user actually move".
 *
 * The cached `wallets.balance` column can drift above a user's true ledger
 * position (debt, pending obligations, phantom drift). Showing the cached
 * figure on the wallet card causes confusing "Insufficient ledger balance"
 * errors at withdrawal time.
 *
 * This hook calls `get_user_available_balance` which returns the LESSER of
 * (cached balance, ledger net) — exactly what the wallet-deduction edge
 * function enforces server-side. The UI uses this number as the headline.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AvailableBalance {
  available: number;
  walletCached: number;
  ledgerNet: number;
  hasDrift: boolean;
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
      const { data: row, error } = await supabase.rpc(
        'get_user_available_balance',
        { _user_id: targetId },
      );
      if (error) throw error;
      const r = (row ?? {}) as Record<string, unknown>;
      setData({
        available: Number(r.available ?? 0),
        walletCached: Number(r.wallet_cached ?? 0),
        ledgerNet: Number(r.ledger_net ?? 0),
        hasDrift: Boolean(r.has_drift),
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

  return { ...(data ?? { available: 0, walletCached: 0, ledgerNet: 0, hasDrift: false }), loading, refresh };
}