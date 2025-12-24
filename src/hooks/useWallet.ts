import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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

  const fetchWallet = useCallback(async () => {
    if (!user) return;

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
    } else {
      setWallet(data);
    }
  }, [user]);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;

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
    } else {
      setTransactions([]);
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
    }
  }, [user, fetchWallet, fetchTransactions]);

  return {
    wallet,
    transactions,
    loading,
    sendMoney,
    depositMoney,
    refreshWallet: fetchWallet,
    refreshTransactions: fetchTransactions,
  };
}
