import { useState } from 'react';
import { AgentOpsHomeView, type DateRange } from './agent-ops-v2/AgentOpsHomeView';
import { AgentOpsBottomNav, type BottomTab } from './agent-ops-v2/AgentOpsBottomNav';
import { AdvanceRequestsQueue } from '@/components/ops/AdvanceRequestsQueue';
import { BusinessAdvanceQueue } from '@/components/ops/BusinessAdvanceQueue';
import { RentHistoryVerificationQueue } from '@/components/ops/RentHistoryVerificationQueue';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { TenantTransferPanel } from './TenantTransferPanel';
import { AgentTenantConnector } from './AgentTenantConnector';
import { AgentOpsPipelineHub } from './AgentOpsPipelineHub';
import { AgentDirectory } from './AgentDirectory';
import { AgentPerformanceTiers } from './AgentPerformanceTiers';
import { AgentLifecyclePipeline } from './AgentLifecyclePipeline';
import { AgentOpsBrief } from './AgentOpsBrief';
import { AgentAlertFeed } from './AgentAlertFeed';
import { AgentTaskManager } from './AgentTaskManager';
import { AgentEscalationQueue } from './AgentEscalationQueue';
import { ServiceCentreVerificationQueue } from './ServiceCentreVerificationQueue';
import { SubAgentVerificationQueue } from './SubAgentVerificationQueue';
import { TenantToSubAgentPanel } from './TenantToSubAgentPanel';
import { AgentOpsFloatPayoutReview } from '@/components/agent/AgentOpsFloatPayoutReview';
import { AgentBalancesPanel } from './AgentBalancesPanel';
import { LendingAgentsPanel } from './LendingAgentsPanel';
import { UserProfileDialog } from '@/components/supporter/UserProfileDialog';
import { TrustCaptureTab } from './TrustCaptureTab';
import { AgentPerformanceReport } from './AgentPerformanceReport';
import { AgentAllocationReport } from './AgentAllocationReport';
import { 
  Users, Banknote, DollarSign, Search, UserPlus, Trophy, BarChart3, 
  ClipboardList, AlertTriangle, Building2, Wallet, Bell, ArrowLeftRight,
  ChevronLeft, Briefcase, TrendingUp, UsersRound, PiggyBank, HandCoins, ShieldCheck, FileBarChart, Network
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format } from 'date-fns';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type ActiveView = null | 'pipeline' | 'brief' | 'directory' | 'connector' | 'performance' | 'lifecycle' | 'tasks' | 'escalations' | 'service-centres' | 'sub-agents' | 'promote-tenant' | 'float-payouts' | 'alerts' | 'leaderboard' | 'earnings' | 'transfers' | 'advance-requests' | 'balances' | 'lending-agents' | 'trust-capture' | 'performance-report' | 'allocation-report';

const NAV_ITEMS: { key: ActiveView; icon: any; label: string; color: string; priority?: boolean }[] = [
  { key: 'performance-report', icon: FileBarChart, label: 'Performance Report', color: 'bg-teal-600', priority: true },
  { key: 'allocation-report', icon: Network, label: 'Allocations & Repayment', color: 'bg-indigo-600', priority: true },
  { key: 'trust-capture', icon: ShieldCheck, label: 'Trust Capture', color: 'bg-primary', priority: true },
  { key: 'pipeline', icon: Briefcase, label: 'Pipeline', color: 'bg-primary', priority: true },
  { key: 'balances', icon: PiggyBank, label: 'Agent Balances', color: 'bg-emerald-600', priority: true },
  { key: 'lending-agents', icon: HandCoins, label: 'Lending Agents', color: 'bg-violet-600', priority: true },
  { key: 'service-centres', icon: Building2, label: 'Service Centres', color: 'bg-orange-500', priority: true },
  { key: 'sub-agents', icon: UsersRound, label: 'Sub-Agents', color: 'bg-amber-600', priority: true },
  { key: 'promote-tenant', icon: ArrowLeftRight, label: 'Tenant → Sub-Agent', color: 'bg-fuchsia-600', priority: true },
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
  { key: 'advance-requests', icon: Banknote, label: 'Advances', color: 'bg-purple-600', priority: true },
  { key: 'brief', icon: DollarSign, label: 'Daily Brief', color: 'bg-rose-500' },
];

export function AgentOpsDashboard() {
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [bottomTab, setBottomTab] = useState<BottomTab>('home');
  const [dateRange, setDateRange] = useState<DateRange>('24h');
  const isMobile = useIsMobile();

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['agent-ops-kpis'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_agent_ops_kpis');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        agents: Number(row?.agents ?? 0),
        earnings_total: Number(row?.earnings_total ?? 0),
        commissions_total: Number(row?.commissions_total ?? 0),
      };
    },
    staleTime: 60_000,
    refetchOnMount: 'always',
  });

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

  const totalEarnings = kpis?.earnings_total ?? 0;
  const totalCommissions = kpis?.commissions_total ?? 0;
  const uniqueAgents = kpis?.agents ?? 0;

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
      case 'trust-capture': return <TrustCaptureTab />;
      case 'performance-report': return <AgentPerformanceReport />;
      case 'allocation-report': return <AgentAllocationReport />;
      case 'pipeline': return <AgentOpsPipelineHub />;
      case 'brief': return <AgentOpsBrief />;
      case 'directory': return <AgentDirectory />;
      case 'connector': return <AgentTenantConnector />;
      case 'performance': return <AgentPerformanceTiers />;
      case 'lifecycle': return <AgentLifecyclePipeline />;
      case 'tasks': return <AgentTaskManager />;
      case 'escalations': return <AgentEscalationQueue />;
      case 'service-centres': return <ServiceCentreVerificationQueue />;
      case 'sub-agents': return <SubAgentVerificationQueue />;
      case 'promote-tenant': return <TenantToSubAgentPanel />;
      case 'float-payouts': return <AgentOpsFloatPayoutReview />;
      case 'balances': return <AgentBalancesPanel />;
      case 'lending-agents': return <LendingAgentsPanel />;
      case 'advance-requests': return (
        <div className="space-y-6">
          <AdvanceRequestsQueue stage="agent_ops" />
          <BusinessAdvanceQueue stage="agent_ops" />
          <RentHistoryVerificationQueue dept="agent_ops" />
        </div>
      );
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
      <div className="space-y-3 pb-[calc(env(safe-area-inset-bottom)+72px)] sm:pb-0">
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
      <div className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+72px)] sm:pb-0">
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

  // Map a bottom-nav tab → opening the matching sub-view
  const handleBottomNav = (tab: BottomTab) => {
    setBottomTab(tab);
    if (tab === 'home') {
      setActiveView(null);
      return;
    }
    if (tab === 'pipeline') {
      setActiveView('pipeline');
      return;
    }
    if (tab === 'agents') {
      setActiveView('directory');
      return;
    }
    if (tab === 'finance') {
      setActiveView('balances');
      return;
    }
    // 'more' just shows the grouped grid below — keep activeView=null
    setActiveView(null);
  };

  const handleOpenSection = (key: string) => {
    setActiveView(key as ActiveView);
  };

  // Grouped sections for the "More" tab
  const MORE_GROUPS: { title: string; keys: ActiveView[] }[] = [
    { title: '🧩 Operations', keys: ['trust-capture', 'escalations', 'tasks'] },
    { title: '👥 Agent Network', keys: ['sub-agents', 'promote-tenant', 'lending-agents'] },
    { title: '🏢 Business', keys: ['service-centres', 'advance-requests'] },
    { title: '📊 Insights', keys: ['leaderboard', 'performance-report', 'allocation-report', 'performance', 'lifecycle', 'alerts', 'brief'] },
    { title: '🔗 System', keys: ['connector', 'transfers', 'float-payouts', 'earnings'] },
  ];

  // HOME VIEW
  return (
    <div className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+72px)] sm:pb-0">
      {/* Greeting header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-foreground">Good day 👋</h2>
          <p className="text-xs text-muted-foreground">Agent Operations Manager</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveView('alerts')}
            className="relative h-9 w-9 rounded-full border border-border bg-card flex items-center justify-center hover:border-primary/30 active:scale-95 transition-all touch-manipulation"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4 text-foreground" />
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
        </div>
      </div>

      {bottomTab !== 'more' ? (
        <AgentOpsHomeView
          range={dateRange}
          onRangeChange={setDateRange}
          onOpenSection={handleOpenSection}
        />
      ) : (
        <div className="space-y-5 pb-20 sm:pb-4">
          {MORE_GROUPS.map((group) => (
            <section key={group.title} className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                {group.title}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                {group.keys.map((key) => {
                  const item = NAV_ITEMS.find((n) => n.key === key);
                  if (!item) return null;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setActiveView(item.key)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-3 rounded-2xl border border-border bg-card',
                        'active:scale-95 transition-all touch-manipulation min-h-[84px]',
                        'hover:shadow-md hover:border-primary/30',
                      )}
                    >
                      <div className={cn('p-2.5 rounded-xl shadow-sm', item.color)}>
                        <item.icon className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-[11px] sm:text-xs font-semibold text-center leading-tight">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Mobile bottom nav */}
      <AgentOpsBottomNav active={bottomTab} onChange={handleBottomNav} />

      <UserProfileDialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)} user={selectedAgent} />
    </div>
  );
}
