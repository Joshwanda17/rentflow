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

    // Try cached data first for instant display
    try {
      const cached = await getCachedWallet(user.id);
      if (cached) {
        setWallet(cached);
        setIsOfflineData(true);
      }
    } catch (e) {
      console.warn('[useWallet] Failed to get cached wallet:', e);
    }

    // Fetch fresh if online
    if (navigator.onLine) {
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
          // Create wallet if doesn't exist
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
      console.warn('[useWallet] Failed to get cached transactions:', e);
    }

    // Fetch fresh if online
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

      // Fetch profile names for transactions
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
        // Cache for offline use
        await cacheTransactions(enrichedTransactions);
      } else {
        setTransactions([]);
      }
    } catch (e) {
      console.warn('[useWallet] Failed to fetch transactions:', e);
    }
  }, [user]);

  const sendMoney = useCallback(async (recipientPhone: string, amount: number, description?: string) => {
    if (!user || !wallet) {
      return { error: new Error('Not authenticated') };
    }

    if (amount <= 0) {
      return { error: new Error('Amount must be greater than 0') };
    }

    if (wallet.balance < amount) {
      return { error: new Error('Insufficient balance') };
    }

    // Find recipient by phone
    const { data: recipientProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('phone', recipientPhone)
      .maybeSingle();

    if (profileError || !recipientProfile) {
      return { error: new Error('Recipient not found with this phone number') };
    }

    if (recipientProfile.id === user.id) {
      return { error: new Error('Cannot send money to yourself') };
    }

    // If offline, queue the transfer
    if (!navigator.onLine) {
      await addToSyncQueue({
        type: 'create',
        table: 'wallet_transfers_queue',
        data: {
          sender_id: user.id,
          recipient_id: recipientProfile.id,
          amount,
          description: description || `Transfer to ${recipientProfile.full_name}`,
        },
      });
      
      // Optimistically update local wallet
      const updatedWallet = { ...wallet, balance: wallet.balance - amount };
      setWallet(updatedWallet);
      await cacheWallet(updatedWallet);
      
      return { data: { queued: true }, error: null };
    }

    // Call edge function to process transfer
    const { data, error } = await supabase.functions.invoke('wallet-transfer', {
      body: {
        recipient_id: recipientProfile.id,
        amount,
        description: description || `Transfer to ${recipientProfile.full_name}`,
      },
    });

    if (error) {
      return { error: new Error(error.message || 'Transfer failed') };
    }

    // Refresh wallet and transactions
    await Promise.all([fetchWallet(), fetchTransactions()]);

    return { data, error: null };
  }, [user, wallet, fetchWallet, fetchTransactions]);

  const depositMoney = useCallback(async (amount: number) => {
    if (!user || !wallet) {
      return { error: new Error('Not authenticated') };
    }

    // For demo purposes, directly update balance
    const { error } = await supabase
      .from('wallets')
      .update({ balance: wallet.balance + amount })
      .eq('user_id', user.id);

    if (error) {
      return { error: new Error('Deposit failed') };
    }

    await fetchWallet();
    return { error: null };
  }, [user, wallet, fetchWallet]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      Promise.all([fetchWallet(), fetchTransactions()]).finally(() => {
        setLoading(false);
      });

      // Subscribe to realtime wallet balance changes
      const walletChannel = supabase
        .channel(`wallet-balance-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'wallets',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('[useWallet] Wallet balance updated in realtime:', payload);
            if (payload.new) {
              setWallet(payload.new as Wallet);
              setIsOfflineData(false);
              cacheWallet(payload.new as Wallet);
            }
          }
        )
        .subscribe();

      // Subscribe to new wallet transactions
      const transactionChannel = supabase
        .channel(`wallet-transactions-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'wallet_transactions',
          },
          (payload) => {
            const tx = payload.new as WalletTransaction;
            if (tx.sender_id === user.id || tx.recipient_id === user.id) {
              console.log('[useWallet] New transaction detected:', payload);
              fetchTransactions();
            }
          }
        )
        .subscribe();

      // Subscribe to wallet withdrawals for instant balance updates
      const withdrawalChannel = supabase
        .channel(`wallet-withdrawals-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'wallet_withdrawals',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            console.log('[useWallet] Withdrawal detected, refreshing wallet');
            fetchWallet();
          }
        )
        .subscribe();

      // Subscribe to referral credits for instant balance updates when someone accepts referral
      const referralChannel = supabase
        .channel(`referral-credits-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'referrals',
            filter: `referrer_id=eq.${user.id}`,
          },
          (payload) => {
            // When a referral is credited, refresh wallet balance
            if (payload.new && (payload.new as any).credited === true) {
              console.log('[useWallet] Referral bonus credited, refreshing wallet');
              fetchWallet();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'referrals',
            filter: `referred_id=eq.${user.id}`,
          },
          () => {
            // When current user is referred and signup bonus credited
            console.log('[useWallet] Signup bonus credited, refreshing wallet');
            fetchWallet();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(walletChannel);
        supabase.removeChannel(transactionChannel);
        supabase.removeChannel(withdrawalChannel);
        supabase.removeChannel(referralChannel);
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
