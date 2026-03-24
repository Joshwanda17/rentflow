import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { TenantTransferPanel } from './TenantTransferPanel';
import { RentPipelineQueue } from './RentPipelineQueue';
import { AgentDirectory } from './AgentDirectory';
import { AgentPerformanceTiers } from './AgentPerformanceTiers';
import { AgentLifecyclePipeline } from './AgentLifecyclePipeline';
import { AgentOpsBrief } from './AgentOpsBrief';
import { AgentAlertFeed } from './AgentAlertFeed';
import { AgentTaskManager } from './AgentTaskManager';
import { AgentEscalationQueue } from './AgentEscalationQueue';
import { AgentOpsFloatPayoutReview } from '@/components/agent/AgentOpsFloatPayoutReview';
import { UserProfileDialog } from '@/components/supporter/UserProfileDialog';
import { Users, Banknote, DollarSign } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format } from 'date-fns';

export function AgentOpsDashboard() {
  const [selectedAgent, setSelectedAgent] = useState<any>(null);

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

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  return (
    <div className="space-y-6">
      {/* Rent Pipeline */}
      <RentPipelineQueue stage="tenant_ops_approved" />

      {/* Daily Brief */}
      <AgentOpsBrief />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard title="Active Agents" value={uniqueAgents} icon={Users} loading={isLoading} />
        <KPICard title="Total Earnings" value={fmt(totalEarnings)} icon={Banknote} loading={isLoading} color="bg-green-500/10 text-green-600" />
        <KPICard title="Commissions Paid" value={fmt(totalCommissions)} icon={DollarSign} color="bg-blue-500/10 text-blue-600" />
      </div>

      {/* 🔍 Agent Directory — PROMINENT */}
      <AgentDirectory />

      {/* Performance & Lifecycle */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AgentPerformanceTiers />
        <AgentLifecyclePipeline />
      </div>

      {/* Tasks & Escalations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AgentTaskManager />
        <AgentEscalationQueue />
      </div>

      {/* Landlord Float Payout Reviews */}
      <AgentOpsFloatPayoutReview />

      {/* Alerts */}
      <AgentAlertFeed />

      {/* Leaderboard & Earnings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">🏆 Agent Leaderboard</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={leaderboard} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" className="text-xs" />
              <YAxis dataKey="agent_name" type="category" className="text-xs" width={80} />
              <Tooltip />
              <Bar
                dataKey="total"
                fill="hsl(var(--primary))"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(data: any) => {
                  if (data?.agent_id) openAgentProfile(data.agent_id);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-3">Recent Earnings</h3>
          <ExecutiveDataTable
            data={earnings || []}
            columns={earningsColumns}
            loading={isLoading}
            title="Agent Earnings"
            filters={[{
              key: 'earning_type',
              label: 'Type',
              options: [
                { value: 'commission', label: 'Commission' },
                { value: 'referral', label: 'Referral' },
                { value: 'bonus', label: 'Bonus' },
              ],
            }]}
          />
        </div>
      </div>

      {/* Tenant Transfer */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <TenantTransferPanel />
      </div>

      <UserProfileDialog
        open={!!selectedAgent}
        onOpenChange={(open) => !open && setSelectedAgent(null)}
        user={selectedAgent}
      />
    </div>
  );
}
