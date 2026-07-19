import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Tracks new wallet activity (general_ledger wallet-scope entries) since the
 * user last viewed their Wallet Statement. Powers the pulsing badge on the
 * Statement trigger button.
 */
const storageKey = (userId: string) => `welile-wallet-statement-last-seen:${userId}`;

export function useWalletActivityBadge(userId: string | undefined) {
  const [count, setCount] = useState(0);
  const [latestAt, setLatestAt] = useState<string | null>(null);

  const getLastSeen = useCallback(() => {
    if (!userId) return null;
    try {
      return localStorage.getItem(storageKey(userId));
    } catch {
      return null;
    }
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const lastSeen = getLastSeen();

    let query = supabase
      .from('general_ledger')
      .select('transaction_date', { count: 'exact', head: false })
      .eq('user_id', userId)
      .eq('ledger_scope', 'wallet')
      .neq('classification', 'admin_correction')
      .neq('category', 'system_balance_correction')
      .order('transaction_date', { ascending: false })
      .limit(1);

    // Also grab count > lastSeen
    let countQuery = supabase
      .from('general_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('ledger_scope', 'wallet')
      .neq('classification', 'admin_correction')
      .neq('category', 'system_balance_correction');

    if (lastSeen) {
      countQuery = countQuery.gt('transaction_date', lastSeen);
    }

    const [latestRes, countRes] = await Promise.all([query, countQuery]);
    const latest = latestRes.data?.[0]?.transaction_date ?? null;
    setLatestAt(latest);
    if (!lastSeen) {
      // First visit ever — treat existing history as already seen; don't
      // spam the badge with hundreds of historical entries.
      if (latest) {
        try { localStorage.setItem(storageKey(userId), latest); } catch {}
      }
      setCount(0);
      return;
    }
    setCount(countRes.count ?? 0);
  }, [userId, getLastSeen]);

  const markSeen = useCallback(() => {
    if (!userId) return;
    const stamp = latestAt || new Date().toISOString();
    try { localStorage.setItem(storageKey(userId), stamp); } catch {}
    setCount(0);
  }, [userId, latestAt]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 30000);

    const channel = supabase
      .channel(`wallet-activity-badge-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'general_ledger', filter: `user_id=eq.${userId}` },
        () => { void refresh(); }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { count, markSeen, refresh };
}