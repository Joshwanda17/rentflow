import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import {
  cacheTransactions,
  getCachedTransactions,
} from '@/lib/offlineDataStorage';
import { useServiceValidation } from '@/core/services/useServiceValidation';

interface WalletTransaction {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: number;
  description: string | null;
  created_at: string;
  sender_name?: string;
  recipient_name?: string;
  recipient_phone?: string;
}

interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  created_at: string;
  updated_at: string;
}
export function useWallet() {
  const { user } = useAuth();
  const { preValidateTransfer, checkBalance } = useServiceValidation();
  // Money must never be hydrated from browser/IndexedDB cache. Older cached
  // first-paint values made funds appear briefly, then disappear after the
  // strict ledger refetch. Start empty and fetch the ledger-derived view.
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const fetchWallet = useCallback(async (_force = false) => {
    if (!user) return;

    if (!navigator.onLine) return;

    try {
      // STRICT-BY-CONSTRUCTION: end users only ever see ledger-derived
      // balances. The wallets.* cache is operator-only (CFO / FinOps
      // reconciliation) and is never read here. `get_user_wallet_view`
      // returns withdrawable / float / advance computed live from
      // general_ledger with admin corrections excluded and pending holds
      // subtracted. We surface the SUM as `balance` so existing call-sites
      // (`wallet?.balance`) keep working without churn.
      const { data: viewRow, error: viewErr } = await supabase.rpc(
        'get_user_wallet_view',
        { p_user_id: user.id },
      );
      if (viewErr) {
        console.warn('[useWallet] strict view error:', viewErr);
        return;
      }
      const v = (viewRow ?? {}) as Record<string, unknown>;
      const withdrawable = Number((v.withdrawable as number | string | undefined) ?? 0);
      const floatBalance = Number((v.float_balance as number | string | undefined) ?? 0);
      // advance is a liability, not spendable — exclude from displayed balance.
      const displayed: Wallet = {
        id: `strict-${user.id}`,
        user_id: user.id,
        balance: withdrawable + floatBalance,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setWallet(displayed);
      setIsOfflineData(false);
      setLastSyncedAt(new Date());
    } catch (e) {
      console.warn('[useWallet] Failed to fetch strict wallet view:', e);
    }
  }, [user]);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;

    // Try cached transactions first
    try {
      const cached = await getCachedTransactions();
      if (cached.length > 0) {
        setTransactions(cached.filter(t => t.sender_id === user.id || t.recipient_id === user.id));
      }
    } catch (e) {
      console.warn('[useWallet] Cache read failed:', e);
    }

    if (!navigator.onLine) return;

    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching transactions:', error);
        return;
      }

      if (data && data.length > 0) {
        // Filter out pool deployment transactions (admin-only visibility)
        const ADMIN_ONLY_DESCRIPTIONS = ['pool deployment'];
        const filteredData = data.filter(t =>
          !ADMIN_ONLY_DESCRIPTIONS.some(term => t.description?.toLowerCase().startsWith(term))
        );
        const userIds = [...new Set([...filteredData.map(t => t.sender_id), ...filteredData.map(t => t.recipient_id)])];
        
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const enrichedTransactions = filteredData.map(t => ({
          ...t,
          sender_name: profileMap.get(t.sender_id)?.full_name || 'Unknown',
          recipient_name: profileMap.get(t.recipient_id)?.full_name || 'Unknown',
          recipient_phone: profileMap.get(t.recipient_id)?.phone || '',
        }));

        setTransactions(enrichedTransactions);
        await cacheTransactions(enrichedTransactions);
      } else {
        setTransactions([]);
      }
    } catch (e) {
      console.warn('[useWallet] Failed to fetch transactions:', e);
    }
  }, [user]);

  const sendMoney = useCallback(async (recipientPhone: string, amount: number, description?: string) => {
    if (!user) return { error: new Error('Please log in first') };

    // Phase 4: Optional pre-validation via new service layer
    const transferCheck = preValidateTransfer({
      senderId: user.id,
      recipientPhone,
      amount,
      description,
    });
    if (!transferCheck.shouldProceed) {
      return { error: new Error(transferCheck.errors?.[0] || 'Validation failed') };
    }

    // Optional balance pre-check (fail-fast)
    if (wallet) {
      const balanceCheck = checkBalance(wallet.balance, amount);
      if (!balanceCheck.shouldProceed) {
        return { error: new Error(balanceCheck.errors?.[0] || 'Insufficient balance') };
      }
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('wallet-transfer', {
        body: {
          recipient_phone: recipientPhone,
          amount,
          description: description || 'Wallet transfer',
        },
      });

      if (error) return { error: new Error(error.message || 'Transfer failed') };
      if (data?.error) return { error: new Error(data.error) };

      // Refresh wallet after successful transfer
      await fetchWallet(true);
      return { error: null };
    } catch (e: any) {
      return { error: new Error(e.message || 'Transfer failed') };
    }
  }, [user, fetchWallet, wallet, preValidateTransfer, checkBalance]);

  const depositMoney = useCallback(async (_amount: number) => {
    // Direct client-side wallet updates are not allowed for security.
    // Use the deposit request flow instead (approve-deposit edge function).
    return { error: new Error('Direct deposits not allowed. Please use the deposit request flow.') };
  }, []);

  useEffect(() => {
    if (user) {
      // Only show loading if we have NO cached data at all — prevents flash when cache exists
      const hasCachedData = wallet !== null;
      if (!hasCachedData) setLoading(true);
      // Only fetch wallet balance on mount — transactions load lazily when wallet sheet opens
      fetchWallet().finally(() => setLoading(false));

      // SINGLE realtime channel for wallet balance only (reduced from 4 channels to 1)
      const walletChannel = supabase
        .channel(`wallet-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `user_id=eq.${user.id}` },
          () => {
            // Don't trust the realtime payload's cached `balance` directly —
            // re-derive against the ledger so the UI always matches backend truth.
            void fetchWallet(true);
          }
        )
        .subscribe();

      // Anti-drift: every 60s wipe old wallet_* localStorage entries and
      // refetch ledger-true balances. We no longer store money balances in
      // browser cache, but this removes stale values from earlier releases.
      const driftInterval = window.setInterval(() => {
        try {
          const keys: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('wallet_')) keys.push(k);
          }
          keys.forEach((k) => localStorage.removeItem(k));
        } catch {}
        void fetchWallet(true);
      }, 60_000);

      return () => {
        supabase.removeChannel(walletChannel);
        window.clearInterval(driftInterval);
      };
    }
  }, [user, fetchWallet, fetchTransactions]);

  const refreshWallet = useCallback(() => fetchWallet(true), [fetchWallet]);

  return {
    wallet,
    transactions,
    loading,
    isOfflineData,
    lastSyncedAt,
    sendMoney,
    depositMoney,
    refreshWallet,
    refreshTransactions: fetchTransactions,
  };
}
