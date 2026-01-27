import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Earning {
  id: string;
  amount: number;
  earning_type: string;
  description: string | null;
  created_at: string;
  source_user_id: string | null;
}

export function useAgentEarnings() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [commissionTotal, setCommissionTotal] = useState(0);
  const [bonusTotal, setBonusTotal] = useState(0);

  const fetchEarnings = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('agent_earnings')
      .select('*')
      .eq('agent_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching earnings:', error);
      return;
    }

    setEarnings(data || []);
    
    const total = (data || []).reduce((sum, e) => sum + Number(e.amount), 0);
    const commissions = (data || []).filter(e => e.earning_type === 'commission')
      .reduce((sum, e) => sum + Number(e.amount), 0);
    const bonuses = (data || []).filter(e => e.earning_type === 'approval_bonus')
      .reduce((sum, e) => sum + Number(e.amount), 0);

    setTotalEarnings(total);
    setCommissionTotal(commissions);
    setBonusTotal(bonuses);
  }, [user]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      fetchEarnings().finally(() => setLoading(false));
    }
  }, [user, fetchEarnings]);

  // Subscribe to real-time earnings updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`agent-earnings-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'agent_earnings',
          filter: `agent_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useAgentEarnings] Earnings changed:', payload);
          fetchEarnings();
        }
      )
      .subscribe();

    // Also subscribe to wallet balance changes for agents (for withdrawal updates)
    const walletChannel = supabase
      .channel(`agent-wallet-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useAgentEarnings] Wallet balance updated:', payload);
          // Trigger re-render by refetching earnings (which updates related displays)
        }
      )
      .subscribe();

    // Subscribe to commission payouts for status updates
    const payoutChannel = supabase
      .channel(`agent-payouts-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_commission_payouts',
          filter: `agent_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useAgentEarnings] Commission payout status changed:', payload);
          fetchEarnings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(walletChannel);
      supabase.removeChannel(payoutChannel);
    };
  }, [user, fetchEarnings]);

  return {
    earnings,
    loading,
    totalEarnings,
    commissionTotal,
    bonusTotal,
    refreshEarnings: fetchEarnings,
  };
}
