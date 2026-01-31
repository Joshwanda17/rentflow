// Offline-first agent dashboard data hook for instant loading
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { 
  cacheDashboardData, 
  getCachedDashboardData,
  cacheProfile,
  getCachedProfile
} from '@/lib/offlineDataStorage';

interface AgentDashboardStats {
  tenantsCount: number;
  referralCount: number;
  subAgentCount: number;
  subAgentEarnings: number;
  walletBalance: number;
  totalEarnings: number;
}

interface UseOfflineAgentDashboardReturn {
  stats: AgentDashboardStats;
  isLoading: boolean;
  isOfflineData: boolean;
  refreshData: () => Promise<void>;
  lastUpdated: Date | null;
  hasLoadedOnce: boolean;
}

const defaultStats: AgentDashboardStats = {
  tenantsCount: 0,
  referralCount: 0,
  subAgentCount: 0,
  subAgentEarnings: 0,
  walletBalance: 0,
  totalEarnings: 0,
};

export function useOfflineAgentDashboard(): UseOfflineAgentDashboardReturn {
  const { user } = useAuth();
  const [stats, setStats] = useState<AgentDashboardStats>(defaultStats);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const fetchInProgress = useRef(false);

  // Load cached data immediately for instant display
  const loadCachedData = useCallback(async () => {
    if (!user) return false;

    try {
      // Try IndexedDB first
      const cachedStats = await getCachedDashboardData(user.id, 'agent');
      
      if (cachedStats) {
        setStats(prev => ({ ...prev, ...cachedStats }));
        setIsOfflineData(true);
        setHasLoadedOnce(true);
        return true;
      }
      
      // Fallback to localStorage
      const cached = localStorage.getItem(`agent_dashboard_${user.id}`);
      if (cached) {
        const data = JSON.parse(cached);
        setStats(prev => ({ ...prev, ...data }));
        setIsOfflineData(true);
        setHasLoadedOnce(true);
        return true;
      }

      return false;
    } catch (error) {
      console.warn('[useOfflineAgentDashboard] Failed to load cached data:', error);
      return false;
    }
  }, [user]);

  // Fetch fresh data from server
  const fetchFreshData = useCallback(async () => {
    if (!user || fetchInProgress.current) return;

    fetchInProgress.current = true;

    try {
      // Parallel fetch for speed - all agent-relevant data
      const [requestsRes, referralsRes, subAgentsRes, subAgentEarningsRes, walletRes, earningsRes] = 
        await Promise.all([
          supabase
            .from('rent_requests')
            .select('id', { count: 'exact', head: true })
            .eq('agent_id', user.id),
          supabase
            .from('referrals')
            .select('id', { count: 'exact', head: true })
            .eq('referrer_id', user.id),
          supabase
            .from('agent_subagents')
            .select('id', { count: 'exact', head: true })
            .eq('parent_agent_id', user.id),
          supabase
            .from('agent_earnings')
            .select('amount')
            .eq('agent_id', user.id)
            .eq('earning_type', 'subagent_commission'),
          supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('agent_earnings')
            .select('amount')
            .eq('agent_id', user.id),
        ]);

      const newStats: AgentDashboardStats = {
        tenantsCount: requestsRes.count || 0,
        referralCount: referralsRes.count || 0,
        subAgentCount: subAgentsRes.count || 0,
        subAgentEarnings: subAgentEarningsRes.data?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0,
        walletBalance: walletRes.data?.balance || 0,
        totalEarnings: earningsRes.data?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0,
      };

      // Update state
      setStats(newStats);
      setIsOfflineData(false);
      setLastUpdated(new Date());
      setHasLoadedOnce(true);

      // Cache for offline use - both IndexedDB and localStorage as fallback
      await cacheDashboardData(user.id, 'agent', newStats);
      localStorage.setItem(`agent_dashboard_${user.id}`, JSON.stringify(newStats));
      
    } catch (error) {
      console.error('[useOfflineAgentDashboard] Failed to fetch data:', error);
    } finally {
      fetchInProgress.current = false;
    }
  }, [user]);

  // Main data loading function
  const refreshData = useCallback(async () => {
    if (!user) {
      setStats(defaultStats);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Load cached data first for instant display
    const hasCachedData = await loadCachedData();
    
    if (hasCachedData) {
      // Show cached data immediately, loading state off
      setIsLoading(false);
    }

    // Fetch fresh data in background if online
    if (navigator.onLine) {
      await fetchFreshData();
    }

    setIsLoading(false);
  }, [user, loadCachedData, fetchFreshData]);

  // Initial load
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Listen for online/offline changes
  useEffect(() => {
    const handleOnline = () => {
      // Refresh when coming back online
      fetchFreshData();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [fetchFreshData]);

  return {
    stats,
    isLoading,
    isOfflineData,
    refreshData,
    lastUpdated,
    hasLoadedOnce,
  };
}
