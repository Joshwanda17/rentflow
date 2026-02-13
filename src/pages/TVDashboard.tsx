import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';
import { 
  Users, 
  Banknote, 
  TrendingUp, 
  UserPlus, 
  Receipt,
  Package,
  Clock,
  Wallet,
  RefreshCw,
  Wifi,
  WifiOff,
  Activity,
  PiggyBank,
  Building2,
  HandCoins
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  newSignupsThisWeek: number;
  totalFacilitated: number;
  pendingRequests: number;
  pendingOrders: number;
  pendingLoans: number;
  totalAgents: number;
  totalSupporters: number;
  totalLandlords: number;
  totalTenants: number;
  totalWalletBalance: number;
  totalInvestmentBalance: number;
  todayRepayments: number;
  weeklyRepayments: number;
}

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function TVDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalUsers: 0,
    activeUsers: 0,
    newSignupsThisWeek: 0,
    totalFacilitated: 0,
    pendingRequests: 0,
    pendingOrders: 0,
    pendingLoans: 0,
    totalAgents: 0,
    totalSupporters: 0,
    totalLandlords: 0,
    totalTenants: 0,
    totalWalletBalance: 0,
    totalInvestmentBalance: 0,
    todayRepayments: 0,
    weeklyRepayments: 0,
  });
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchMetrics = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Only fetch wallet + auth + rent data (core functions)
      const [
        rolesRes,
        requestsRes,
        walletsRes,
      ] = await Promise.all([
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('rent_requests').select('id, status, rent_amount'),
        supabase.from('wallets').select('balance'),
      ]);
      // Stub removed queries
      const profilesRes = { data: [] as any[] };
      const ordersRes = { data: [] as any[] };
      const loansRes = { data: [] as any[] };
      const investmentsRes = { data: [] as any[] };
      const todayRepaymentsRes = { data: [] as any[] };
      const weeklyRepaymentsRes = { data: [] as any[] };

      const roles = rolesRes.data || [];
      const requests = requestsRes.data || [];
      const uniqueUserIds = new Set(roles.map(r => r.user_id));

      // Count roles
      const roleCounts = roles.reduce((acc, r) => {
        acc[r.role] = (acc[r.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate totals
      const totalWalletBalance = (walletsRes.data || []).reduce((sum, w) => sum + Number(w.balance || 0), 0);
      const totalInvestmentBalance = (investmentsRes.data || []).reduce((sum, a) => sum + Number(a.balance || 0), 0);
      const todayRepayments = (todayRepaymentsRes.data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const weeklyRepayments = (weeklyRepaymentsRes.data || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

      setMetrics({
        totalUsers: uniqueUserIds.size,
        activeUsers: 0,
        newSignupsThisWeek: 0,
        totalFacilitated: requests
          .filter(r => ['funded', 'disbursed', 'completed'].includes(r.status))
          .reduce((sum, r) => sum + Number(r.rent_amount), 0),
        pendingRequests: requests.filter(r => r.status === 'pending').length,
        pendingOrders: (ordersRes.data || []).filter(o => ['pending', 'processing'].includes(o.status)).length,
        pendingLoans: (loansRes.data || []).filter(l => l.status === 'pending').length,
        totalAgents: roleCounts['agent'] || 0,
        totalSupporters: roleCounts['supporter'] || 0,
        totalLandlords: roleCounts['landlord'] || 0,
        totalTenants: roleCounts['tenant'] || 0,
        totalWalletBalance,
        totalInvestmentBalance,
        todayRepayments,
        weeklyRepayments,
      });

      setLastUpdated(new Date());
    } catch (error) {
      console.error('[TVDashboard] Error fetching metrics:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const formatLargeNumber = (num: number) => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
            <Activity className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
              Welile Dashboard
            </h1>
            <p className="text-purple-300 text-lg">Real-time Platform Metrics</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-purple-300">
            {isRefreshing ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : isOnline ? (
              <Wifi className="h-5 w-5 text-green-400" />
            ) : (
              <WifiOff className="h-5 w-5 text-red-400" />
            )}
            <span className="text-sm">
              Updated: {format(lastUpdated, 'HH:mm:ss')}
            </span>
          </div>
          <div className="text-4xl lg:text-5xl font-bold text-white/90">
            {format(new Date(), 'HH:mm')}
          </div>
        </div>
      </div>

      {/* Primary Metrics - Large Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6">
        <MetricCard
          icon={Banknote}
          label="Total Facilitated"
          value={formatUGX(metrics.totalFacilitated)}
          iconColor="from-green-500 to-emerald-600"
          size="large"
        />
        <MetricCard
          icon={Wallet}
          label="Platform Wallet Balance"
          value={formatUGX(metrics.totalWalletBalance)}
          iconColor="from-blue-500 to-cyan-600"
          size="large"
        />
        <MetricCard
          icon={PiggyBank}
          label="Investment Pool"
          value={formatUGX(metrics.totalInvestmentBalance)}
          iconColor="from-purple-500 to-pink-600"
          size="large"
        />
        <MetricCard
          icon={HandCoins}
          label="Weekly Repayments"
          value={formatUGX(metrics.weeklyRepayments)}
          iconColor="from-amber-500 to-orange-600"
          size="large"
        />
      </div>

      {/* User Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6 mb-6">
        <MetricCard
          icon={Users}
          label="Total Users"
          value={formatLargeNumber(metrics.totalUsers)}
          iconColor="from-indigo-500 to-blue-600"
        />
        <MetricCard
          icon={UserPlus}
          label="New This Week"
          value={metrics.newSignupsThisWeek.toString()}
          iconColor="from-teal-500 to-green-600"
        />
        <MetricCard
          icon={Users}
          label="Tenants"
          value={formatLargeNumber(metrics.totalTenants)}
          iconColor="from-sky-500 to-blue-600"
        />
        <MetricCard
          icon={Users}
          label="Agents"
          value={formatLargeNumber(metrics.totalAgents)}
          iconColor="from-violet-500 to-purple-600"
        />
        <MetricCard
          icon={Users}
          label="Supporters"
          value={formatLargeNumber(metrics.totalSupporters)}
          iconColor="from-rose-500 to-pink-600"
        />
      </div>

      {/* Activity Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6 mb-6">
        <MetricCard
          icon={Building2}
          label="Landlords"
          value={formatLargeNumber(metrics.totalLandlords)}
          iconColor="from-orange-500 to-amber-600"
        />
        <MetricCard
          icon={Receipt}
          label="Pending Requests"
          value={metrics.pendingRequests.toString()}
          iconColor="from-yellow-500 to-orange-600"
          highlight={metrics.pendingRequests > 0}
        />
        <MetricCard
          icon={Package}
          label="Pending Orders"
          value={metrics.pendingOrders.toString()}
          iconColor="from-cyan-500 to-blue-600"
          highlight={metrics.pendingOrders > 0}
        />
        <MetricCard
          icon={Clock}
          label="Pending Loans"
          value={metrics.pendingLoans.toString()}
          iconColor="from-red-500 to-rose-600"
          highlight={metrics.pendingLoans > 0}
        />
        <MetricCard
          icon={TrendingUp}
          label="Today's Repayments"
          value={formatUGX(metrics.todayRepayments)}
          iconColor="from-lime-500 to-green-600"
        />
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 to-transparent p-6">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-2 text-purple-300 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Auto-refreshing every 30 seconds
          </div>
          <div className="text-purple-300 text-sm">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  iconColor: string;
  size?: 'normal' | 'large';
  highlight?: boolean;
}

function MetricCard({ icon: Icon, label, value, iconColor, size = 'normal', highlight = false }: MetricCardProps) {
  const isLarge = size === 'large';
  
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl lg:rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 transition-all duration-300",
      isLarge ? "p-6 lg:p-8" : "p-4 lg:p-6",
      highlight && "ring-2 ring-yellow-500/50 animate-pulse"
    )}>
      {/* Background Gradient */}
      <div className={cn(
        "absolute inset-0 opacity-20 bg-gradient-to-br",
        iconColor
      )} />
      
      <div className="relative z-10">
        <div className={cn(
          "inline-flex items-center justify-center rounded-xl lg:rounded-2xl bg-gradient-to-br",
          iconColor,
          isLarge ? "w-14 h-14 lg:w-16 lg:h-16 mb-4" : "w-10 h-10 lg:w-12 lg:h-12 mb-3"
        )}>
          <Icon className={cn(
            "text-white",
            isLarge ? "h-7 w-7 lg:h-8 lg:w-8" : "h-5 w-5 lg:h-6 lg:w-6"
          )} />
        </div>
        
        <p className={cn(
          "text-purple-300 font-medium mb-1",
          isLarge ? "text-sm lg:text-base" : "text-xs lg:text-sm"
        )}>
          {label}
        </p>
        
        <p className={cn(
          "font-bold text-white tracking-tight",
          isLarge ? "text-2xl lg:text-4xl" : "text-xl lg:text-2xl"
        )}>
          {value}
        </p>
      </div>
    </div>
  );
}
