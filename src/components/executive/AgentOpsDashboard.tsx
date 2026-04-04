import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { TenantTransferPanel } from './TenantTransferPanel';
import { AgentTenantConnector } from './AgentTenantConnector';
import { RentPipelineQueue } from './RentPipelineQueue';
import { AgentDirectory } from './AgentDirectory';
import { AgentPerformanceTiers } from './AgentPerformanceTiers';
import { AgentLifecyclePipeline } from './AgentLifecyclePipeline';
import { AgentOpsBrief } from './AgentOpsBrief';
import { AgentAlertFeed } from './AgentAlertFeed';
import { AgentTaskManager } from './AgentTaskManager';
import { AgentEscalationQueue } from './AgentEscalationQueue';
import { ServiceCentreVerificationQueue } from './ServiceCentreVerificationQueue';
import { SubAgentVerificationQueue } from './SubAgentVerificationQueue';
import { AgentOpsFloatPayoutReview } from '@/components/agent/AgentOpsFloatPayoutReview';
import { UserProfileDialog } from '@/components/supporter/UserProfileDialog';
import { 
  Users, Banknote, DollarSign, Search, UserPlus, Trophy, BarChart3, 
  ClipboardList, AlertTriangle, Building2, Wallet, Bell, ArrowLeftRight,
  ChevronLeft, Briefcase, TrendingUp, UsersRound
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type ActiveView = null | 'pipeline' | 'brief' | 'directory' | 'connector' | 'performance' | 'lifecycle' | 'tasks' | 'escalations' | 'service-centres' | 'sub-agents' | 'float-payouts' | 'alerts' | 'leaderboard' | 'earnings' | 'transfers';

const NAV_ITEMS: { key: ActiveView; icon: any; label: string; color: string; priority?: boolean }[] = [
  { key: 'pipeline', icon: Briefcase, label: 'Pipeline', color: 'bg-primary', priority: true },
  { key: 'service-centres', icon: Building2, label: 'Service Centres', color: 'bg-orange-500', priority: true },
  { key: 'sub-agents', icon: UsersRound, label: 'Sub-Agents', color: 'bg-amber-600', priority: true },
  { key: 'directory', icon: Search, label: 'Agents', color: 'bg-blue-500', priority: true },
  { key: 'tasks', icon: ClipboardList, label: 'Tasks', color: 'bg-emerald-500', priority: true },
  { key: 'escalations', icon: AlertTriangle, label: 'Escalations', color: 'bg-red-500' },
  { key: 'connector', icon: UserPlus, label: 'Connect', color: 'bg-violet-500' },
  { key: 'float-payouts', icon: Wallet, label: 'Float Payouts', color: 'bg-pink-500' },
  { key: 'performance', icon: TrendingUp, label: 'Performance', color: 'bg-teal-500' },
  { key: 'lifecycle', icon: BarChart3, label: 'Lifecycle', color: 'bg-indigo-500' },
  { key: 'leaderboard', icon: Trophy, label: 'Leaderboard', color: 'bg-amber-500' },
  { key: 'earnings', icon: Banknote, label: 'Earnings', color: 'bg-green-500' },
  { key: 'alerts', icon: Bell, label: 'Alerts', color: 'bg-slate-500' },
  { key: 'transfers', icon: ArrowLeftRight, label: 'Transfers', color: 'bg-cyan-600' },
  { key: 'brief', icon: DollarSign, label: 'Daily Brief', color: 'bg-rose-500' },
];

export function AgentOpsDashboard() {
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const isMobile = useIsMobile();

  const { data: earnings, isLoading } = useQuery({
    queryKey: ['exec-agent-earnings'],
    queryFn: async () => {
      const { data } = await supabase.from('agent_earnings').select('agent_id, amount, earning_type, created_at')
        .order('created_at', { ascending: false }).limit(200);
      return data || [];
    },
    staleTime: 600000,
  });

  const { data: commissions } = useQuery({
    queryKey: ['exec-agent-commissions'],
    queryFn: async () => {
      const { data } = await supabase.from('agent_commission_payouts').select('agent_id, amount, status, created_at')
        .order('created_at', { ascending: false }).limit(100);
      return data || [];
    },
    staleTime: 600000,
  });

  const agentIds = [...new Set([...(earnings || []).map(e => e.agent_id), ...(commissions || []).map(c => c.agent_id)])];
  const { data: agentProfiles } = useQuery({
    queryKey: ['exec-agent-profiles-full', agentIds.sort().join(',')],
    queryFn: async () => {
      if (agentIds.length === 0) return {};
      const BATCH = 50;
      const allProfiles: any[] = [];
      for (let i = 0; i < agentIds.length; i += BATCH) {
        const { data } = await supabase.from('profiles')
          .select('id, full_name, phone, email, avatar_url, verified, created_at, territory')
          .in('id', agentIds.slice(i, i + BATCH));
        if (data) allProfiles.push(...data);
      }
      const map: Record<string, any> = {};
      allProfiles.forEach(p => { map[p.id] = p; });
      return map;
    },
    enabled: agentIds.length > 0,
    staleTime: 600000,
  });

  const getName = (id: string) => agentProfiles?.[id]?.full_name || id.substring(0, 8) + '...';

  const openAgentProfile = (agentId: string) => {
    const profile = agentProfiles?.[agentId];
    setSelectedAgent({
      id: agentId,
      name: profile?.full_name || 'Unknown Agent',
      avatarUrl: profile?.avatar_url,
      type: 'agent' as const,
      createdAt: profile?.created_at,
      phone: profile?.phone,
      verified: profile?.verified,
      city: profile?.territory,
    });
  };

  const totalEarnings = (earnings || []).reduce((s, e) => s + e.amount, 0);
  const totalCommissions = (commissions || []).reduce((s, c) => s + c.amount, 0);
  const uniqueAgents = new Set((earnings || []).map(e => e.agent_id)).size;

  const agentTotals: Record<string, number> = {};
  (earnings || []).forEach(e => {
    agentTotals[e.agent_id] = (agentTotals[e.agent_id] || 0) + e.amount;
  });
  const leaderboard = Object.entries(agentTotals)
    .map(([id, total]) => ({ agent_id: id, agent_name: getName(id), total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const earningsColumns: Column<any>[] = [
    { key: 'created_at', label: 'Date', render: (v) => v ? format(new Date(v as string), 'dd MMM yy') : '—' },
    { key: 'agent_id', label: 'Agent', render: (v) => (
      <button
        onClick={() => openAgentProfile(String(v))}
        className="text-primary hover:underline font-medium text-left"
      >
        {getName(String(v))}
      </button>
    )},
    { key: 'earning_type', label: 'Type', render: (v) => (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted">{String(v)}</span>
    )},
    { key: 'amount', label: 'Amount (UGX)', render: (v) => Number(v || 0).toLocaleString() },
  ];

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  const viewLabel = NAV_ITEMS.find(i => i.key === activeView)?.label || '';

  // Render sub-view content
  const renderSubView = () => {
    switch (activeView) {
      case 'pipeline': return <RentPipelineQueue stage="tenant_ops_approved" />;
      case 'brief': return <AgentOpsBrief />;
      case 'directory': return <AgentDirectory />;
      case 'connector': return <AgentTenantConnector />;
      case 'performance': return <AgentPerformanceTiers />;
      case 'lifecycle': return <AgentLifecyclePipeline />;
      case 'tasks': return <AgentTaskManager />;
      case 'escalations': return <AgentEscalationQueue />;
      case 'service-centres': return <ServiceCentreVerificationQueue />;
      case 'sub-agents': return <SubAgentVerificationQueue />;
      case 'float-payouts': return <AgentOpsFloatPayoutReview />;
      case 'alerts': return <AgentAlertFeed />;
      case 'transfers': return (
        <div className="rounded-2xl border border-border bg-card p-3">
          <TenantTransferPanel />
        </div>
      );
      case 'leaderboard': return (
        <div className="rounded-2xl border border-border bg-card p-3 overflow-x-auto">
          <h3 className="text-sm font-semibold mb-3">🏆 Agent Leaderboard</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={leaderboard} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" className="text-xs" />
              <YAxis dataKey="agent_name" type="category" className="text-xs" width={80} />
              <Tooltip />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} cursor="pointer"
                onClick={(data: any) => { if (data?.agent_id) openAgentProfile(data.agent_id); }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
      case 'earnings': return (
        <ExecutiveDataTable data={earnings || []} columns={earningsColumns} loading={isLoading} title="Agent Earnings"
          filters={[{ key: 'earning_type', label: 'Type', options: [
            { value: 'commission', label: 'Commission' },
            { value: 'referral', label: 'Referral' },
            { value: 'bonus', label: 'Bonus' },
          ]}]}
        />
      );
      default: return null;
    }
  };

  // MOBILE: Show sub-view inline with back button
  if (isMobile && activeView) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setActiveView(null)}
          className="flex items-center gap-2 text-sm font-semibold text-primary active:scale-95 transition-transform touch-manipulation py-2"
        >
          <ChevronLeft className="h-5 w-5" />
          Back to Overview
        </button>
        <h2 className="text-lg font-bold">{viewLabel}</h2>
        {renderSubView()}
        <UserProfileDialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)} user={selectedAgent} />
      </div>
    );
  }

  // DESKTOP: Show sub-view inline (no grid replacement)
  if (!isMobile && activeView) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setActiveView(null)}
          className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Agent Ops Overview
        </button>
        {renderSubView()}
        <UserProfileDialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)} user={selectedAgent} />
      </div>
    );
  }

  // HOME VIEW: KPIs + Quick Nav Grid
  return (
    <div className="space-y-4">
      {/* KPIs — compact on mobile */}
      <div className="grid grid-cols-3 gap-2">
        <KPICard title="Agents" value={uniqueAgents} icon={Users} loading={isLoading} />
        <KPICard title="Earnings" value={fmt(totalEarnings)} icon={Banknote} loading={isLoading} color="bg-green-500/10 text-green-600" />
        <KPICard title="Commissions" value={fmt(totalCommissions)} icon={DollarSign} color="bg-blue-500/10 text-blue-600" />
      </div>

      {/* Quick Nav Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveView(item.key)}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-card",
              "active:scale-95 transition-all touch-manipulation min-h-[88px]",
              "hover:shadow-md hover:border-primary/30",
              item.priority && "ring-1 ring-primary/20"
            )}
          >
            <div className={cn("p-3 rounded-xl shadow-sm", item.color)}>
              <item.icon className="h-5 w-5 text-white" />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-center leading-tight">{item.label}</span>
          </button>
        ))}
      </div>

      <UserProfileDialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)} user={selectedAgent} />
    </div>
  );
}
