import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { 
  Crown, Cpu, Megaphone, MessageSquare, Users, Home, Building2, 
  Shield, Activity, BarChart3, Wallet, Handshake, LayoutDashboard
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/hooks/auth/types';

interface DashboardCard {
  label: string;
  description: string;
  icon: typeof Crown;
  route: string;
  color: string;
}

const executiveDashboards: DashboardCard[] = [
  { label: 'CEO', description: 'Platform overview & strategy', icon: Crown, route: '/ceo/dashboard', color: 'bg-amber-500/10 text-amber-700 border-amber-500/30' },
  { label: 'CTO', description: 'Infrastructure & engineering', icon: Cpu, route: '/cto/dashboard', color: 'bg-blue-500/10 text-blue-700 border-blue-500/30' },
  { label: 'CFO', description: 'Financial governance', icon: BarChart3, route: '/cfo/dashboard', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' },
  { label: 'COO', description: 'Operations health', icon: Activity, route: '/coo/dashboard', color: 'bg-purple-500/10 text-purple-700 border-purple-500/30' },
  { label: 'CMO', description: 'Marketing & growth', icon: Megaphone, route: '/cmo/dashboard', color: 'bg-pink-500/10 text-pink-700 border-pink-500/30' },
  { label: 'CRM', description: 'Customer support & disputes', icon: MessageSquare, route: '/crm/dashboard', color: 'bg-orange-500/10 text-orange-700 border-orange-500/30' },
];

const operationsDashboards: DashboardCard[] = [
  { label: 'Agent Ops', description: 'Agent performance & activity', icon: Users, route: '/dashboard?role=agent', color: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30' },
  { label: 'Tenant Ops', description: 'Tenant metrics & rentals', icon: Home, route: '/dashboard?role=tenant', color: 'bg-teal-500/10 text-teal-700 border-teal-500/30' },
  { label: 'Landlord Ops', description: 'Property management', icon: Building2, route: '/dashboard?role=landlord', color: 'bg-sky-500/10 text-sky-700 border-sky-500/30' },
  { label: 'Partner Ops', description: 'Supporter portfolios', icon: Handshake, route: '/dashboard?role=supporter', color: 'bg-violet-500/10 text-violet-700 border-violet-500/30' },
];

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState('access-panel');
  const navigate = useNavigate();

  const renderAccessPanel = () => (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold mb-1">Dashboard Access Panel</h2>
        <p className="text-sm text-muted-foreground mb-4">Open any dashboard environment</p>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Executive Dashboards</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {executiveDashboards.map((d) => (
            <button
              key={d.label}
              onClick={() => navigate(d.route)}
              className={cn(
                'flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99]',
                d.color
              )}
            >
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-background/60">
                <d.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{d.label} Dashboard</p>
                <p className="text-xs text-muted-foreground truncate">{d.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Operations Dashboards</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {operationsDashboards.map((d) => (
            <button
              key={d.label}
              onClick={() => navigate(d.route)}
              className={cn(
                'flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99]',
                d.color
              )}
            >
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-background/60">
                <d.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{d.label}</p>
                <p className="text-xs text-muted-foreground truncate">{d.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        navigate('/users');
        return null;
      case 'audit':
        navigate('/audit-log');
        return null;
      case 'deposits':
        navigate('/deposits-management');
        return null;
      default:
        return renderAccessPanel();
    }
  };

  return (
    <ExecutiveDashboardLayout role="super_admin" activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </ExecutiveDashboardLayout>
  );
}
