import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { 
  cacheWallet, 
  getCachedWallet, 
  cacheTransactions, 
  getCachedTransactions,
  addToSyncQueue 
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
// Module-level wallet cache to prevent duplicate fetches across component instances
let walletCache: { data: Wallet | null; userId: string; timestamp: number } | null = null;
// Keep a tiny module-level cache so multiple hook instances on the same render
// don't all fire the same fetch, but never long enough to mask a real change
// in withdrawable funds. Realtime UPDATE events override this immediately.
const WALLET_CACHE_TTL = 5_000; // 5 seconds
// Bump this whenever the wallet shape or invalidation logic changes — old
// localStorage entries from previous releases will be discarded on next load.
const WALLET_LS_VERSION = 'v2';
const lsKey = (uid?: string) => `wallet_${WALLET_LS_VERSION}_${uid}`;

export function useWallet() {
  const { user } = useAuth();
  const { preValidateTransfer, checkBalance } = useServiceValidation();
  // Initialize from module cache OR localStorage for instant display (no flash)
  const [wallet, setWallet] = useState<Wallet | null>(() => {
    if (walletCache && walletCache.userId === user?.id && (Date.now() - walletCache.timestamp < WALLET_CACHE_TTL)) {
      return walletCache.data;
    }
    // Sync read from localStorage for instant first-paint
    try {
      const raw = localStorage.getItem(lsKey(user?.id));
      if (raw) return JSON.parse(raw) as Wallet;
      // Clean up any stale pre-v2 cache so it can never be served again
      try { localStorage.removeItem(`wallet_${user?.id}`); } catch {}
    } catch {}
    return null;
  });
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  // Never show loading if we have ANY cached balance — show stale data instantly
  const [loading, setLoading] = useState(() => {
    if (walletCache && walletCache.userId === user?.id) return false;
    try {
      return !localStorage.getItem(lsKey(user?.id));
    } catch { return true; }
  });
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const fetchWallet = useCallback(async (force = false) => {
    if (!user) return;

    // Check module-level cache first (prevents duplicate fetches from multiple hook instances)
    if (!force && walletCache && walletCache.userId === user.id && (Date.now() - walletCache.timestamp < WALLET_CACHE_TTL)) {
      setWallet(walletCache.data);
      setLoading(false);
      setIsOfflineData(false);
      return;
    }

    // Try cached data first
    try {
      const cached = await getCachedWallet(user.id);
      if (cached) {
        setWallet(cached);
        setIsOfflineData(true);
      }
    } catch (e) {
      console.warn('[useWallet] Cache read failed:', e);
    }

    if (!navigator.onLine) return;

    try {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching wallet:', error);
        return;
      }

      if (!data) {
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          .insert({ user_id: user.id, balance: 0 })
          .select()
          .single();

        if (createError) {
          console.error('Error creating wallet:', createError);
          return;
        }
        setWallet(newWallet);
        setIsOfflineData(false);
        setLastSyncedAt(new Date());
        walletCache = { data: newWallet, userId: user.id, timestamp: Date.now() };
        try { localStorage.setItem(lsKey(user.id), JSON.stringify(newWallet)); } catch {}
        await cacheWallet(newWallet);
      } else {
        setWallet(data);
        setIsOfflineData(false);
        setLastSyncedAt(new Date());
        walletCache = { data, userId: user.id, timestamp: Date.now() };
        try { localStorage.setItem(lsKey(user.id), JSON.stringify(data)); } catch {}
        await cacheWallet(data);
      }
    } catch (e) {
      console.warn('[useWallet] Failed to fetch wallet:', e);
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
          (payload) => {
          if (payload.new) {
              const updated = payload.new as Wallet;
              setWallet(updated);
              setIsOfflineData(false);
              setLastSyncedAt(new Date());
              walletCache = { data: updated, userId: user.id, timestamp: Date.now() };
              try { localStorage.setItem(lsKey(user.id), JSON.stringify(updated)); } catch {}
              cacheWallet(updated);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(walletChannel);
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
