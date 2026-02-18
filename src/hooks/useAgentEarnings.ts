import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { getCachedDashboardData, cacheDashboardData } from '@/lib/offlineDataStorage';

interface Earning {
  id: string;
  amount: number;
  earning_type: string;
  description: string | null;
  created_at: string;
  source_user_id: string | null;
}

const EARNINGS_CACHE_KEY = 'agent_earnings';

export function useAgentEarnings() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [commissionTotal, setCommissionTotal] = useState(0);
  const [bonusTotal, setBonusTotal] = useState(0);
  const [totalPaidOut, setTotalPaidOut] = useState(0);
  const [availableToWithdraw, setAvailableToWithdraw] = useState(0);

  const computeTotals = (data: Earning[], paidOut: number, walletBalance: number) => {
    const total = data.reduce((sum, e) => sum + Number(e.amount), 0);
    setTotalEarnings(total);
    setCommissionTotal(data.filter(e => e.earning_type === 'commission').reduce((sum, e) => sum + Number(e.amount), 0));
    setBonusTotal(data.filter(e => e.earning_type === 'approval_bonus').reduce((sum, e) => sum + Number(e.amount), 0));
    setTotalPaidOut(paidOut);
    setAvailableToWithdraw(Math.max(0, walletBalance));
  };

  const fetchEarnings = useCallback(async () => {
    if (!user) return;

    // Try cache first
    if (!navigator.onLine) {
      try {
        const cached = await getCachedDashboardData(user.id, EARNINGS_CACHE_KEY);
        if (cached) {
          setEarnings(cached as Earning[]);
          computeTotals(cached as Earning[], 0, 0);
        }
      } catch {}
      return;
    }

    // Fetch earnings, payouts, and wallet balance in parallel
    const [earningsRes, payoutsRes, walletRes] = await Promise.all([
      supabase
        .from('agent_earnings')
        .select('*')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('agent_commission_payouts')
        .select('amount, status')
        .eq('agent_id', user.id)
        .in('status', ['pending', 'approved']),
      supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (earningsRes.error) {
      console.error('Error fetching earnings:', earningsRes.error);
      return;
    }

    const result = earningsRes.data || [];
    const paidOut = (payoutsRes.data || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const walletBalance = walletRes.data?.balance ? Number(walletRes.data.balance) : 0;

    setEarnings(result);
    computeTotals(result, paidOut, walletBalance);

    // Cache for offline
    try { await cacheDashboardData(user.id, EARNINGS_CACHE_KEY, result); } catch {}
  }, [user]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      fetchEarnings().finally(() => setLoading(false));
    }
  }, [user, fetchEarnings]);

  return {
    earnings,
    loading,
    totalEarnings,
    commissionTotal,
    bonusTotal,
    totalPaidOut,
    availableToWithdraw,
    refreshEarnings: fetchEarnings,
  };
}
