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
        { p_user_id: targetId },
      );
      if (error) throw error;
      // The RPC returns a scalar `numeric` (the available amount). Older
      // versions returned a row; we tolerate both shapes for safety.
      let available = 0;
      let walletCached = 0;
      let ledgerNet = 0;
      let hasDrift = false;
      if (row !== null && typeof row === 'object') {
        const r = row as Record<string, unknown>;
        available = Number(r.available ?? 0);
        walletCached = Number(r.wallet_cached ?? 0);
        ledgerNet = Number(r.ledger_net ?? 0);
        hasDrift = Boolean(r.has_drift);
      } else {
        available = Number(row ?? 0);
      }
      // Pull cached wallet balance separately so the card can show "Total"
      // alongside the strict available figure.
      if (walletCached === 0) {
        const { data: walletRow } = await supabase
          .from('wallets')
          .select('balance, withdrawable_balance')
          .eq('user_id', targetId)
          .maybeSingle();
        walletCached = Number(
          (walletRow as { withdrawable_balance?: number; balance?: number } | null)?.withdrawable_balance
          ?? (walletRow as { balance?: number } | null)?.balance
          ?? 0,
        );
      }
      setData({
        available,
        walletCached,
        ledgerNet,
        hasDrift: hasDrift || walletCached > available,
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