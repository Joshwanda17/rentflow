// Offline-first dashboard data hook for instant loading on smartphones
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { 
  cacheDashboardData, 
  getCachedDashboardData,
  cacheRentRequests,
  getCachedRentRequests,
  cacheNotifications,
  getCachedNotifications,
} from '@/lib/offlineDataStorage';

interface DashboardStats {
  pendingRentRequests: number;
  activeRentRequests: number;
  totalRepayments: number;
  walletBalance: number;
  unreadNotifications: 0;
}

interface UseOfflineDashboardReturn {
  stats: DashboardStats | null;
  rentRequests: any[];
  notifications: any[];
  isLoading: boolean;
  isOfflineData: boolean;
  refreshData: () => Promise<void>;
  lastUpdated: Date | null;
}

const defaultStats: DashboardStats = {
  pendingRentRequests: 0,
  activeRentRequests: 0,
  totalRepayments: 0,
  walletBalance: 0,
  unreadNotifications: 0,
};

export function useOfflineDashboard(): UseOfflineDashboardReturn {
  const { user, role } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [rentRequests, setRentRequests] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const fetchInProgress = useRef(false);

  // Load cached data immediately for instant display
  const loadCachedData = useCallback(async () => {
    if (!user || !role) return false;

    try {
      const [cachedStats, cachedRentRequests, cachedNotifications] = await Promise.all([
        getCachedDashboardData(user.id, role),
        getCachedRentRequests(),
        getCachedNotifications(),
      ]);

      let hasData = false;

      if (cachedStats) {
        setStats(cachedStats);
        hasData = true;
      }

      if (cachedRentRequests.length > 0) {
        setRentRequests(cachedRentRequests);
        hasData = true;
      }

      if (cachedNotifications.length > 0) {
        setNotifications(cachedNotifications);
        hasData = true;
      }

      if (hasData) {
        setIsOfflineData(true);
      }

      return hasData;
    } catch (error) {
      console.warn('[useOfflineDashboard] Failed to load cached data:', error);
      return false;
    }
  }, [user, role]);

  // Fetch fresh data from server
  const fetchFreshData = useCallback(async () => {
    if (!user || !role || fetchInProgress.current) return;

    fetchInProgress.current = true;

    try {
      // Parallel fetch for speed
      const [rentData, walletData] = await Promise.all([
        supabase
          .from('rent_requests')
          .select('*')
          .eq('tenant_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      const requests = rentData.data || [];
      const notifs: any[] = [];
      const walletBalance = walletData.data?.balance || 0;

      // Calculate stats
      const newStats: DashboardStats = {
        pendingRentRequests: requests.filter(r => r.status === 'pending').length,
        activeRentRequests: requests.filter(r => r.status === 'active' || r.status === 'approved').length,
        totalRepayments: requests.reduce((sum, r) => sum + (r.total_repayment || 0), 0),
        walletBalance,
        unreadNotifications: 0,
      };

      // Update state
      setStats(newStats);
      setRentRequests(requests);
      setNotifications(notifs);
      setIsOfflineData(false);
      setLastUpdated(new Date());

      // Cache for offline use
      await Promise.all([
        cacheDashboardData(user.id, role, newStats),
        cacheRentRequests(requests),
        cacheNotifications(notifs),
      ]);
    } catch (error) {
      console.error('[useOfflineDashboard] Failed to fetch data:', error);
    } finally {
      fetchInProgress.current = false;
    }
  }, [user, role]);

  // Main data loading function
  const refreshData = useCallback(async () => {
    if (!user || !role) {
      setStats(null);
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
  }, [user, role, loadCachedData, fetchFreshData]);

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
    stats: stats || defaultStats,
    rentRequests,
    notifications,
    isLoading,
    isOfflineData,
    refreshData,
    lastUpdated,
  };
}
