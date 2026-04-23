import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { cacheWallet, getCachedWallet } from '@/lib/offlineDataStorage';
import { useServiceValidation } from '@/core/services/useServiceValidation';
import { useWalletRealtime } from './useWalletRealtime';

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
  withdrawable_balance: number;
  float_balance: number;
  advance_balance: number;
  locked_balance: number;
  created_at: string;
  updated_at: string;
}

export function useWallet() {
  const { user } = useAuth();
  const { preValidateTransfer, checkBalance } = useServiceValidation();
  const queryClient = useQueryClient();

  // Realtime invalidation (wallets, wallet_deductions, general_ledger)
  useWalletRealtime(user?.id);

  const walletQuery = useQuery<Wallet | null>({
    queryKey: ['wallet', user?.id],
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    queryFn: async () => {
      if (!user) return null;

      if (!navigator.onLine) {
        const cached = await getCachedWallet(user.id).catch(() => null);
        return (cached as Wallet) || null;
      }

      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[useWallet] fetch error:', error);
        const cached = await getCachedWallet(user.id).catch(() => null);
        return (cached as Wallet) || null;
      }

      let row = data as Wallet | null;
      if (!row) {
        const { data: created, error: createError } = await supabase
          .from('wallets')
          .insert({ user_id: user.id, balance: 0 })
          .select('*')
          .single();
        if (createError) {
          console.error('[useWallet] create error:', createError);
          return null;
        }
        row = created as Wallet;
      }

      cacheWallet(row).catch(() => {});
      return row;
    },
  });

  const wallet = walletQuery.data ?? null;
  const loading = walletQuery.isLoading;
  const isOfflineData = !navigator.onLine;
  const lastSyncedAt = walletQuery.dataUpdatedAt ? new Date(walletQuery.dataUpdatedAt) : null;

  // Transactions — fetched on demand by the wallet sheet
  const txQuery = useQuery<WalletTransaction[]>({
    queryKey: ['wallet-transactions', user?.id],
    enabled: false, // lazy: opened by refreshTransactions
    staleTime: 30_000,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error || !data) return [];
      const ADMIN_ONLY = ['pool deployment'];
      const filtered = data.filter(
        (t: any) => !ADMIN_ONLY.some((term) => t.description?.toLowerCase().startsWith(term)),
      );
      const userIds = [
        ...new Set([...filtered.map((t: any) => t.sender_id), ...filtered.map((t: any) => t.recipient_id)]),
      ];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      const map = new Map((profiles || []).map((p: any) => [p.id, p]));
      return filtered.map((t: any) => ({
        ...t,
        sender_name: map.get(t.sender_id)?.full_name || 'Unknown',
        recipient_name: map.get(t.recipient_id)?.full_name || 'Unknown',
        recipient_phone: map.get(t.recipient_id)?.phone || '',
      }));
    },
  });

  const refreshWallet = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['wallet', user?.id] });
    return walletQuery.refetch();
  }, [queryClient, user?.id, walletQuery]);

  const refreshTransactions = useCallback(() => {
    return txQuery.refetch();
  }, [txQuery]);

  const sendMoney = useCallback(
    async (recipientPhone: string, amount: number, description?: string) => {
      if (!user) return { error: new Error('Please log in first') };

      const transferCheck = preValidateTransfer({
        senderId: user.id,
        recipientPhone,
        amount,
        description,
      });
      if (!transferCheck.shouldProceed) {
        return { error: new Error(transferCheck.errors?.[0] || 'Validation failed') };
      }

      if (wallet) {
        const balanceCheck = checkBalance(wallet.withdrawable_balance ?? wallet.balance, amount);
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
        await refreshWallet();
        return { error: null };
      } catch (e: any) {
        return { error: new Error(e.message || 'Transfer failed') };
      }
    },
    [user, wallet, preValidateTransfer, checkBalance, refreshWallet],
  );

  const depositMoney = useCallback(async (_amount: number) => {
    return { error: new Error('Direct deposits not allowed. Please use the deposit request flow.') };
  }, []);

  return {
    wallet,
    transactions: txQuery.data ?? [],
    loading,
    isOfflineData,
    lastSyncedAt,
    sendMoney,
    depositMoney,
    refreshWallet,
    refreshTransactions,
  };
}
