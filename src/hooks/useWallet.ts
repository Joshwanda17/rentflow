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
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineData, setIsOfflineData] = useState(false);

  const fetchWallet = useCallback(async () => {
    if (!user) return;

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
        await cacheWallet(newWallet);
      } else {
        setWallet(data);
        setIsOfflineData(false);
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
        .limit(20);

      if (error) {
        console.error('Error fetching transactions:', error);
        return;
      }

      if (data && data.length > 0) {
        const userIds = [...new Set([...data.map(t => t.sender_id), ...data.map(t => t.recipient_id)])];
        
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, phone')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        const enrichedTransactions = data.map(t => ({
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
    if (!user || !wallet) return { error: new Error('Not authenticated') };
    if (amount <= 0) return { error: new Error('Amount must be greater than 0') };
    if (wallet.balance < amount) return { error: new Error('Insufficient balance') };

    const { data: recipientProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('phone', recipientPhone)
      .maybeSingle();

    if (profileError || !recipientProfile) return { error: new Error('Recipient not found') };
    if (recipientProfile.id === user.id) return { error: new Error('Cannot send money to yourself') };

    if (!navigator.onLine) {
      await addToSyncQueue({
        type: 'create',
        table: 'wallet_transfers_queue',
        data: { sender_id: user.id, recipient_id: recipientProfile.id, amount, description: description || `Transfer to ${recipientProfile.full_name}` },
      });
      const updatedWallet = { ...wallet, balance: wallet.balance - amount };
      setWallet(updatedWallet);
      await cacheWallet(updatedWallet);
      return { data: { queued: true }, error: null };
    }

    const { data, error } = await supabase.functions.invoke('wallet-transfer', {
      body: { recipient_id: recipientProfile.id, amount, description: description || `Transfer to ${recipientProfile.full_name}` },
    });

    if (error) return { error: new Error(error.message || 'Transfer failed') };
    await Promise.all([fetchWallet(), fetchTransactions()]);
    return { data, error: null };
  }, [user, wallet, fetchWallet, fetchTransactions]);

  const depositMoney = useCallback(async (amount: number) => {
    if (!user || !wallet) return { error: new Error('Not authenticated') };
    const { error } = await supabase.from('wallets').update({ balance: wallet.balance + amount }).eq('user_id', user.id);
    if (error) return { error: new Error('Deposit failed') };
    await fetchWallet();
    return { error: null };
  }, [user, wallet, fetchWallet]);

  useEffect(() => {
    if (user) {
      setLoading(true);
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
              setWallet(payload.new as Wallet);
              setIsOfflineData(false);
              cacheWallet(payload.new as Wallet);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(walletChannel);
      };
    }
  }, [user, fetchWallet, fetchTransactions]);

  return {
    wallet,
    transactions,
    loading,
    isOfflineData,
    sendMoney,
    depositMoney,
    refreshWallet: fetchWallet,
    refreshTransactions: fetchTransactions,
  };
}
