import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AgentOpsHomeView, type DateRange } from './agent-ops-v2/AgentOpsHomeView';
import { AgentOpsBottomNav, type BottomTab } from './agent-ops-v2/AgentOpsBottomNav';
import { AdvanceRequestsQueue } from '@/components/ops/AdvanceRequestsQueue';
import { AdvanceRequestsReviewed } from '@/components/ops/AdvanceRequestsReviewed';
import { AdvanceRepaymentsPanel } from '@/components/ops/AdvanceRepaymentsPanel';
import { ActiveAdvancesPanel } from '@/components/ops/ActiveAdvancesPanel';
import { BusinessAdvanceQueue } from '@/components/ops/BusinessAdvanceQueue';
import { RentHistoryVerificationQueue } from '@/components/ops/RentHistoryVerificationQueue';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { TenantTransferPanel } from './TenantTransferPanel';
import { LockedTenantTransferPanel } from './LockedTenantTransferPanel';
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
import { AgentFeatureFlagsPanel } from './AgentFeatureFlagsPanel';
import { AgentBulkOpsConsole } from './AgentBulkOpsConsole';
import { AgentDailyOverviewReportButton } from './AgentDailyOverviewReportButton';
import { AgentRentCapacityPanel } from './AgentRentCapacityPanel';
import { AgentAdvanceRepaymentMonitor } from './agent-ops-v2/AgentAdvanceRepaymentMonitor';
import { AgentMonthlyKpis } from './agent-ops-v2/AgentMonthlyKpis';
import { AgentAdvancePotential } from './agent-ops-v2/AgentAdvancePotential';
import { AgentAdvanceLimits } from './agent-ops-v2/AgentAdvanceLimits';
import { AdvanceAnalyticsPanel } from './agent-ops-v2/AdvanceAnalyticsPanel';
import { AgentLeaderboardPanel } from './AgentLeaderboardPanel';
import { AgentListingCampaignPanel } from './AgentListingCampaignPanel';
import { DailyRentReport } from '@/components/reports/DailyRentReport';
import { usePendingAdvanceCount } from '@/hooks/usePendingAdvanceCount';
import { Badge } from '@/components/ui/badge';
import { 
  Users, Banknote, DollarSign, Search, UserPlus, Trophy, BarChart3, 
  ClipboardList, AlertTriangle, Building2, Wallet, Bell, ArrowLeftRight,
  ChevronLeft, Briefcase, TrendingUp, TrendingDown, UsersRound, PiggyBank, HandCoins, ShieldCheck, FileBarChart, Network,
  LayoutGrid, ChevronDown, ToggleRight, Layers, Gauge, Target, Activity
  , Coins, Megaphone, Lock
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type ActiveView = null | 'pipeline' | 'brief' | 'directory' | 'rent-capacity' | 'connector' | 'performance' | 'lifecycle' | 'tasks' | 'escalations' | 'service-centres' | 'sub-agents' | 'promote-tenant' | 'float-payouts' | 'alerts' | 'leaderboard' | 'earnings' | 'transfers' | 'locked-transfers' | 'advance-requests' | 'active-advances' | 'advance-potential' | 'advance-limits' | 'advance-repayments' | 'balances' | 'lending-agents' | 'trust-capture' | 'performance-report' | 'allocation-report' | 'feature-flags' | 'bulk-ops' | 'listing-campaign' | 'daily-collections-report';

const NAV_ITEMS: { key: ActiveView; icon: any; label: string; color: string; priority?: boolean }[] = [
  { key: 'advance-potential', icon: Target, label: 'Advance Potential', color: 'bg-purple-700', priority: true },
  { key: 'daily-collections-report', icon: FileBarChart, label: 'Daily Rent Collections', color: 'bg-emerald-700', priority: true },
  { key: 'advance-limits', icon: Coins, label: 'Advance Limits', color: 'bg-emerald-800', priority: true },
  { key: 'advance-repayments', icon: TrendingDown, label: 'Repayments', color: 'bg-emerald-700', priority: true },
  { key: 'bulk-ops', icon: Layers, label: 'Bulk Ops Console', color: 'bg-rose-700', priority: true },
  { key: 'performance-report', icon: FileBarChart, label: 'Performance Report', color: 'bg-teal-600', priority: true },
  { key: 'allocation-report', icon: Network, label: 'Allocations & Repayment', color: 'bg-indigo-600', priority: true },
  { key: 'pipeline', icon: Briefcase, label: 'Pipeline', color: 'bg-primary', priority: true },
  { key: 'balances', icon: PiggyBank, label: 'Agent Balances', color: 'bg-emerald-600', priority: true },
  { key: 'lending-agents', icon: HandCoins, label: 'Lending Agents', color: 'bg-violet-600', priority: true },
  { key: 'service-centres', icon: Building2, label: 'Service Centres', color: 'bg-orange-500', priority: true },
  { key: 'sub-agents', icon: UsersRound, label: 'Sub-Agents', color: 'bg-amber-600', priority: true },
  { key: 'promote-tenant', icon: ArrowLeftRight, label: 'Tenant → Sub-Agent', color: 'bg-fuchsia-600', priority: true },
  { key: 'directory', icon: Search, label: 'Agents', color: 'bg-blue-500', priority: true },
  { key: 'rent-capacity', icon: Gauge, label: 'Rent Capacity', color: 'bg-cyan-500', priority: true },
  { key: 'tasks', icon: ClipboardList, label: 'Tasks', color: 'bg-emerald-500', priority: true },
  { key: 'escalations', icon: AlertTriangle, label: 'Escalations', color: 'bg-red-500' },
  { key: 'connector', icon: UserPlus, label: 'Connect', color: 'bg-violet-500' },
  { key: 'float-payouts', icon: Wallet, label: 'Float Payouts', color: 'bg-pink-500' },
  { key: 'performance', icon: TrendingUp, label: 'Performance', color: 'bg-teal-500' },
  { key: 'lifecycle', icon: BarChart3, label: 'Lifecycle', color: 'bg-indigo-500' },
  { key: 'leaderboard', icon: Trophy, label: 'Leaderboard', color: 'bg-amber-500' },
  { key: 'listing-campaign', icon: Megaphone, label: 'Weekly Listing Campaign', color: 'bg-purple-600' },
  { key: 'earnings', icon: Banknote, label: 'Earnings', color: 'bg-green-500' },
  { key: 'alerts', icon: Bell, label: 'Alerts', color: 'bg-slate-500' },
  { key: 'transfers', icon: ArrowLeftRight, label: 'Transfers', color: 'bg-cyan-600' },
  { key: 'locked-transfers', icon: Lock, label: 'Locked → Area Transfer', color: 'bg-rose-600', priority: true },
  { key: 'advance-requests', icon: Banknote, label: 'Advances', color: 'bg-purple-600', priority: true },
  { key: 'active-advances', icon: Activity, label: 'Active Advances', color: 'bg-purple-500', priority: true },
  { key: 'brief', icon: DollarSign, label: 'Daily Brief', color: 'bg-rose-500' },
];

export function AgentOpsDashboard() {
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [bottomTab, setBottomTab] = useState<BottomTab>('home');
  const [dateRange, setDateRange] = useState<DateRange>('24h');
  const pendingAdvanceCount = usePendingAdvanceCount();

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
      case 'daily-collections-report': return <DailyRentReport mode="agent" />;
      case 'performance-report': return <Navigate to="/agent-performance-report" replace />;
      case 'allocation-report': return <AgentAllocationReport />;
      case 'feature-flags': return <AgentFeatureFlagsPanel onBack={() => setActiveView(null)} />;
      case 'bulk-ops': return <AgentBulkOpsConsole onBack={() => setActiveView(null)} />;
      case 'pipeline': return <AgentOpsPipelineHub />;
      case 'brief': return <AgentOpsBrief />;
      case 'directory': return <AgentDirectory />;
      case 'rent-capacity': return <AgentRentCapacityPanel />;
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
          <AdvanceAnalyticsPanel />
          <AdvanceRequestsQueue stage="agent_ops" />
          <AdvanceRequestsReviewed />
          <BusinessAdvanceQueue stage="agent_ops" />
          <RentHistoryVerificationQueue dept="agent_ops" />
        </div>
      );
      case 'active-advances': return <ActiveAdvancesPanel />;
      case 'advance-potential': return <AgentAdvancePotential />;
      case 'advance-limits': return <AgentAdvanceLimits />;
      case 'advance-repayments': return <AdvanceRepaymentsPanel />;
      case 'alerts': return <AgentAlertFeed />;
      case 'transfers': return (
        <div className="rounded-2xl border border-border bg-card p-3">
          <TenantTransferPanel />
        </div>
      );
      case 'locked-transfers': return (
        <div className="rounded-2xl border border-border bg-card p-3">
          <LockedTenantTransferPanel />
        </div>
      );
      case 'leaderboard': return <AgentLeaderboardPanel />;
      case 'listing-campaign': return <AgentListingCampaignPanel />;
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

  // Map a bottom-nav tab → opening the matching sub-view
  const handleBottomNav = (tab: BottomTab) => {
    setBottomTab(tab);
    if (tab === 'home') { setActiveView(null); return; }
    if (tab === 'pipeline') { setActiveView('pipeline'); return; }
    if (tab === 'agents') { setActiveView('directory'); return; }
    if (tab === 'finance') { setActiveView('balances'); return; }
    setActiveView(null);
  };

  const handleOpenSection = (key: string) => {
    setActiveView(key as ActiveView);
  };

  // Grouped sections for the "More" tab (mobile dropdown + grid)
  const MORE_GROUPS: { title: string; keys: ActiveView[] }[] = [
    { title: '👥 Agent Network', keys: ['directory', 'rent-capacity', 'sub-agents', 'promote-tenant', 'lending-agents', 'balances'] },
    { title: '🧩 Operations', keys: ['trust-capture', 'pipeline', 'escalations', 'tasks', 'connector'] },
    { title: '💰 Advances', keys: ['advance-requests', 'active-advances', 'advance-potential', 'advance-limits', 'advance-repayments'] },
    { title: '🏢 Business', keys: ['service-centres', 'transfers', 'locked-transfers', 'float-payouts'] },
    { title: '📊 Insights', keys: ['leaderboard', 'listing-campaign', 'performance-report', 'performance', 'lifecycle', 'allocation-report', 'earnings', 'brief', 'alerts'] },
    { title: '🔗 System', keys: ['bulk-ops'] },
  ];

  // Main content region — sub-view when one is active, else the overview / more-grid.
  const contentRegion = activeView ? (
    <div className="space-y-4">
      <button
        onClick={() => setActiveView(null)}
        className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline lg:hidden"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Agent Ops Overview
      </button>
      <h2 className="text-lg font-bold">{viewLabel}</h2>
      {renderSubView()}
    </div>
  ) : bottomTab !== 'more' ? (
    <div className="space-y-4">
      <AgentMonthlyKpis />
      <AdvanceAnalyticsPanel />
      <AgentOpsHomeView
        range={dateRange}
        onRangeChange={setDateRange}
        onOpenSection={handleOpenSection}
      />
      <AgentAdvanceRepaymentMonitor />
    </div>
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
              const showBadge = item.key === 'advance-requests' && pendingAdvanceCount > 0;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveView(item.key)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3 rounded-2xl border border-border bg-card',
                    'active:scale-95 transition-all touch-manipulation min-h-[84px]',
                    'hover:shadow-md hover:border-primary/30',
                    'relative',
                  )}
                >
                  {showBadge && (
                    <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {pendingAdvanceCount > 99 ? '99+' : pendingAdvanceCount}
                    </span>
                  )}
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
  );

  // HOME VIEW / shell
  return (
    <div className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+72px)] sm:pb-4">
      {/* Greeting header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-foreground">Good day 👋</h2>
          <p className="text-xs text-muted-foreground">Agent Operations Manager</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AgentDailyOverviewReportButton />
          {/* Section switcher — mobile / tablet only (desktop uses the left sidebar) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="lg:hidden h-9 px-3 rounded-full border border-border bg-card flex items-center gap-1.5 text-xs font-semibold text-foreground hover:border-primary/30 active:scale-95 transition-all touch-manipulation"
                aria-label="All Agent Ops sections"
              >
                <LayoutGrid className="h-4 w-4 text-primary" />
                <span className="hidden xs:inline">All sections</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-[70vh] overflow-y-auto">
              {MORE_GROUPS.map((group, gi) => (
                <div key={group.title}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {group.title}
                  </DropdownMenuLabel>
                  {group.keys.map((key) => {
                    const item = NAV_ITEMS.find((n) => n.key === key);
                    if (!item) return null;
                    const Icon = item.icon;
                    const showBadge = item.key === 'advance-requests' && pendingAdvanceCount > 0;
                    return (
                      <DropdownMenuItem
                        key={item.key as string}
                        onClick={() => setActiveView(item.key)}
                        className="gap-2.5 cursor-pointer"
                      >
                        <span className={cn('p-1.5 rounded-md shrink-0', item.color)}>
                          <Icon className="h-3.5 w-3.5 text-white" />
                        </span>
                        <span className="text-sm font-medium">{item.label}</span>
                        {showBadge && (
                          <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                            {pendingAdvanceCount > 99 ? '99+' : pendingAdvanceCount}
                          </span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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

      {/* Body: persistent left sidebar (desktop) + content */}
      <div className="lg:flex lg:gap-5 lg:items-start">
        <AgentOpsSideNav
          activeView={activeView}
          onSelect={(k) => setActiveView(k)}
          onHome={() => { setBottomTab('home'); setActiveView(null); }}
        />
        <div className="flex-1 min-w-0">{contentRegion}</div>
      </div>

      {/* Mobile bottom nav */}
      <AgentOpsBottomNav active={bottomTab} onChange={handleBottomNav} />

      <UserProfileDialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)} user={selectedAgent} />
    </div>
  );
}

/* ===================================================================
 * AgentOpsSideNav — persistent desktop left navigation for the Agent
 * Ops Dashboard. Mirrors the mobile "All sections" menu but always
 * visible on lg+. Advances is pinned to the top (Priority group).
 * =================================================================== */
function AgentOpsSideNav({
  activeView,
  onSelect,
  onHome,
}: {
  activeView: ActiveView;
  onSelect: (k: ActiveView) => void;
  onHome: () => void;
}) {
  const pendingAdvanceCount = usePendingAdvanceCount();
  // Priority stays pinned & always exposed on top. Every other group is
  // collapsible so the nav never over-scrolls. Agent Network sits right
  // below Priority and is open by default (this dashboard is agent-centric).
  const SIDE_GROUPS: { title: string; keys: ActiveView[]; pinned?: boolean; defaultOpen?: boolean }[] = [
    { title: 'Advances', pinned: true, keys: ['advance-requests', 'active-advances', 'advance-potential', 'advance-limits', 'advance-repayments'] },
    { title: 'Agent Network', defaultOpen: true, keys: ['directory', 'rent-capacity', 'sub-agents', 'promote-tenant', 'lending-agents', 'balances'] },
    { title: 'Operations', keys: ['pipeline', 'escalations', 'tasks', 'connector'] },
    { title: 'Business', keys: ['service-centres', 'transfers', 'float-payouts'] },
    { title: 'Performance & Insights', keys: ['leaderboard', 'listing-campaign', 'performance-report', 'performance', 'lifecycle', 'allocation-report', 'earnings', 'brief', 'alerts'] },
    { title: 'System', keys: ['bulk-ops'] },
  ];

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    SIDE_GROUPS.forEach((g) => { init[g.title] = !!g.defaultOpen; });
    return init;
  });
  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  const renderItem = (key: ActiveView) => {
    const item = NAV_ITEMS.find((n) => n.key === key);
    if (!item) return null;
    const Icon = item.icon;
    const active = activeView === key;
    const showBadge = item.key === 'advance-requests' && pendingAdvanceCount > 0;
    return (
      <button
        key={key as string}
        type="button"
        onClick={() => onSelect(key)}
        className={cn(
          'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
          active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
        )}
      >
        <span className={cn('h-6 w-6 rounded-md flex items-center justify-center shrink-0', item.color)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </span>
        <span className="truncate">{item.label}</span>
        {showBadge && (
          <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
            {pendingAdvanceCount > 99 ? '99+' : pendingAdvanceCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="hidden lg:flex flex-col w-56 shrink-0 sticky top-0 self-start max-h-[calc(100dvh-8.5rem)] overflow-y-auto pr-2">
      <nav className="space-y-3 py-1">
        <button
          type="button"
          onClick={onHome}
          className={cn(
            'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors',
            !activeView ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
          )}
        >
          <span className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-primary">
            <LayoutGrid className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="truncate">Overview</span>
        </button>

        {SIDE_GROUPS.map((group) => {
          const containsActive = group.keys.includes(activeView as ActiveView);
          const open = group.pinned || openGroups[group.title] || containsActive;
          if (group.pinned) {
            return (
              <div key={group.title} className="space-y-1">
                <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                  {group.title}
                </p>
                {group.keys.map(renderItem)}
              </div>
            );
          }
          return (
            <div key={group.title} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                className="w-full flex items-center justify-between px-2 py-1 rounded-md hover:bg-muted/60 transition-colors"
                aria-expanded={open}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open ? '' : '-rotate-90')} />
              </button>
              {open && <div className="space-y-1">{group.keys.map(renderItem)}</div>}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
