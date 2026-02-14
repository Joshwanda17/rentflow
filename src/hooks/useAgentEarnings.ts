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

  const computeTotals = (data: Earning[]) => {
    setTotalEarnings(data.reduce((sum, e) => sum + Number(e.amount), 0));
    setCommissionTotal(data.filter(e => e.earning_type === 'commission').reduce((sum, e) => sum + Number(e.amount), 0));
    setBonusTotal(data.filter(e => e.earning_type === 'approval_bonus').reduce((sum, e) => sum + Number(e.amount), 0));
  };

  const fetchEarnings = useCallback(async () => {
    if (!user) return;

    // Try cache first
    if (!navigator.onLine) {
      try {
        const cached = await getCachedDashboardData(user.id, EARNINGS_CACHE_KEY);
        if (cached) {
          setEarnings(cached as Earning[]);
          computeTotals(cached as Earning[]);
        }
      } catch {}
      return;
    }

    const { data, error } = await supabase
      .from('agent_earnings')
      .select('*')
      .eq('agent_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching earnings:', error);
      return;
    }

    const result = data || [];
    setEarnings(result);
    computeTotals(result);

    // Cache for offline
    try { await cacheDashboardData(user.id, EARNINGS_CACHE_KEY, result); } catch {}
  }, [user]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      fetchEarnings().finally(() => setLoading(false));
    }
  }, [user, fetchEarnings]);

  // NO realtime channels — earnings are not in the realtime whitelist.
  // Users see updated earnings on pull-to-refresh or next dashboard visit.

  return {
    earnings,
    loading,
    totalEarnings,
    commissionTotal,
    bonusTotal,
    refreshEarnings: fetchEarnings,
  };
}
