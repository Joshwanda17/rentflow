import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Users, TrendingUp, Home, Banknote, ShieldCheck, UserPlus, 
  Building2, Clock, AlertTriangle, CheckCircle, Handshake, 
  Loader2, UserCheck, User, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';
import { formatDistanceToNow } from 'date-fns';
import { COOWithdrawalApprovals } from '@/components/coo/COOWithdrawalApprovals';

type HealthStatus = 'green' | 'yellow' | 'red';

interface MetricTile {
  id: string;
  label: string;
  value: string | number;
  icon: typeof Users;
  status: HealthStatus;
  detail?: string;
  route?: string;
}

function getStatusColor(status: HealthStatus) {
  return {
    green: 'border-emerald-500/40 bg-emerald-500/8',
    yellow: 'border-amber-500/40 bg-amber-500/8',
    red: 'border-red-500/40 bg-red-500/8',
  }[status];
}

function getStatusIconColor(status: HealthStatus) {
  return {
    green: 'text-emerald-600',
    yellow: 'text-amber-600',
    red: 'text-red-600',
  }[status];
}

export default function COODashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['coo-metrics'],
    queryFn: async () => {
      const [usersRes, loansRes, landlordsRes, partnersRes] = await Promise.all([
        supabase.from('profiles').select('id, created_at', { count: 'exact', head: false }).limit(1),
        supabase.from('user_loans').select('id, status, amount', { count: 'exact', head: false }),
        supabase.from('landlords').select('id, verified', { count: 'exact', head: false }),
        supabase.from('investor_portfolios').select('id, status', { count: 'exact', head: false }),
      ]);

      const totalUsers = usersRes.count || 0;
      const totalLoans = loansRes.data?.length || 0;
      const activeLoans = loansRes.data?.filter(l => l.status === 'active').length || 0;
      const totalLandlords = landlordsRes.count || 0;
      const verifiedLandlords = landlordsRes.data?.filter(l => l.verified).length || 0;
      const totalPartners = partnersRes.count || 0;
      const activePartners = partnersRes.data?.filter(p => p.status === 'active').length || 0;

      return {
        totalUsers,
        totalLoans,
        activeLoans,
        totalLandlords,
        verifiedLandlords,
        totalPartners,
        activePartners,
      };
    },
  });

  const tiles: MetricTile[] = metrics ? [
    { id: 'users', label: 'Total Users', value: metrics.totalUsers, icon: Users, status: 'green' as HealthStatus },
    { id: 'loans', label: 'Active Loans', value: metrics.activeLoans, icon: Banknote, status: metrics.activeLoans > 0 ? 'green' : 'yellow' as HealthStatus, detail: `${metrics.totalLoans} total` },
    { id: 'landlords', label: 'Landlords', value: metrics.totalLandlords, icon: Building2, status: 'green' as HealthStatus, detail: `${metrics.verifiedLandlords} verified` },
    { id: 'partners', label: 'Active Partners', value: metrics.activePartners, icon: Handshake, status: metrics.activePartners > 0 ? 'green' : 'yellow' as HealthStatus, detail: `${metrics.totalPartners} total` },
  ] : [];

  const renderContent = () => {
    if (activeTab === 'withdrawals') {
      return <COOWithdrawalApprovals />;
    }

    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Operations Overview</h1>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map((tile) => (
              <button
                key={tile.id}
                onClick={() => tile.route && navigate(tile.route)}
                className={cn(
                  'p-4 rounded-xl border-2 text-left transition-all hover:shadow-md',
                  getStatusColor(tile.status)
                )}
              >
                <tile.icon className={cn('h-5 w-5 mb-2', getStatusIconColor(tile.status))} />
                <p className="text-2xl font-bold">{tile.value}</p>
                <p className="text-xs text-muted-foreground">{tile.label}</p>
                {tile.detail && <p className="text-[10px] text-muted-foreground mt-1">{tile.detail}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <ExecutiveDashboardLayout role="coo" activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </ExecutiveDashboardLayout>
  );
}
