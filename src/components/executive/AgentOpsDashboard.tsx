import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { Users, Trophy, Banknote, TrendingUp, UserCheck, DollarSign } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { format } from 'date-fns';

export function AgentOpsDashboard() {
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

  const totalEarnings = (earnings || []).reduce((s, e) => s + e.amount, 0);
  const totalCommissions = (commissions || []).reduce((s, c) => s + c.amount, 0);
  const uniqueAgents = new Set((earnings || []).map(e => e.agent_id)).size;

  // Leaderboard
  const agentTotals: Record<string, number> = {};
  (earnings || []).forEach(e => {
    agentTotals[e.agent_id] = (agentTotals[e.agent_id] || 0) + e.amount;
  });
  const leaderboard = Object.entries(agentTotals)
    .map(([id, total]) => ({ agent_id: id.substring(0, 8), total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const earningsColumns: Column<any>[] = [
    { key: 'created_at', label: 'Date', render: (v) => v ? format(new Date(v as string), 'dd MMM yy') : '—' },
    { key: 'agent_id', label: 'Agent', render: (v) => String(v).substring(0, 8) + '...' },
    { key: 'earning_type', label: 'Type', render: (v) => (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted">{String(v)}</span>
    )},
    { key: 'amount', label: 'Amount (UGX)', render: (v) => Number(v || 0).toLocaleString() },
  ];

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard title="Active Agents" value={uniqueAgents} icon={Users} loading={isLoading} />
        <KPICard title="Total Earnings" value={fmt(totalEarnings)} icon={Banknote} loading={isLoading} color="bg-green-500/10 text-green-600" />
        <KPICard title="Commissions Paid" value={fmt(totalCommissions)} icon={DollarSign} color="bg-blue-500/10 text-blue-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">🏆 Agent Leaderboard</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={leaderboard} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" className="text-xs" />
              <YAxis dataKey="agent_id" type="category" className="text-xs" width={80} />
              <Tooltip />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
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
    </div>
  );
}
