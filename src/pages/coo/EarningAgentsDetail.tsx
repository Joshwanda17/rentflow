import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import COODetailLayout, { KPICard, SectionTitle, DataRow } from '@/components/coo/COODetailLayout';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatUGX } from '@/lib/rentCalculations';

export default function EarningAgentsDetail() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!user || !roles.includes('manager'))) { navigate('/dashboard'); return; }
    if (user && roles.includes('manager')) fetchData();
  }, [user, loading, roles]);

  async function fetchData() {
    setIsLoading(true);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [earningsRes, allAgentsRes] = await Promise.all([
        supabase.from('agent_earnings').select('agent_id, amount, earning_type, created_at').gte('created_at', sevenDaysAgo),
        supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'agent'),
      ]);

      const earnings = earningsRes.data || [];
      const totalAgents = allAgentsRes.count || 0;

      // Aggregate by agent
      const agentMap = new Map<string, number>();
      let totalRevenue = 0;
      earnings.forEach(e => {
        agentMap.set(e.agent_id, (agentMap.get(e.agent_id) || 0) + e.amount);
        totalRevenue += e.amount;
      });

      const earningAgents = agentMap.size;
      const avgPerAgent = earningAgents > 0 ? totalRevenue / earningAgents : 0;

      // Top & underperforming
      const sorted = Array.from(agentMap.entries()).sort((a, b) => b[1] - a[1]);
      const topAgentIds = sorted.slice(0, 5).map(s => s[0]);
      const bottomAgentIds = sorted.slice(-3).map(s => s[0]);
      const allIds = [...new Set([...topAgentIds, ...bottomAgentIds])];

      let nameMap = new Map<string, string>();
      if (allIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', allIds);
        nameMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
      }

      const topAgents = sorted.slice(0, 5).map(([id, amt]) => ({
        name: nameMap.get(id) || id.slice(0, 8),
        amount: amt,
      }));
      const bottomAgents = sorted.slice(-3).map(([id, amt]) => ({
        name: nameMap.get(id) || id.slice(0, 8),
        amount: amt,
      }));

      // Earning type breakdown
      const typeMap = new Map<string, number>();
      earnings.forEach(e => { typeMap.set(e.earning_type, (typeMap.get(e.earning_type) || 0) + e.amount); });
      const typeBreakdown = Array.from(typeMap.entries()).sort((a, b) => b[1] - a[1]);

      setData({ earningAgents, totalAgents, totalRevenue, avgPerAgent, topAgents, bottomAgents, typeBreakdown });
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  const status = data.earningAgents > 5 ? 'green' as const : data.earningAgents > 0 ? 'yellow' as const : 'red' as const;

  return (
    <COODetailLayout title="Earning Agents" subtitle="7-Day Agent Performance" status={status}>
      <div className="grid grid-cols-2 gap-3">
        <KPICard label="Earning Agents" value={data.earningAgents} status={status} />
        <KPICard label="Total Agents" value={data.totalAgents} status="green" />
        <KPICard label="Total Revenue" value={formatUGX(data.totalRevenue)} status="green" />
        <KPICard label="Avg / Agent" value={formatUGX(Math.round(data.avgPerAgent))} status="green" />
      </div>

      <SectionTitle>Top Performing Agents</SectionTitle>
      <div className="rounded-2xl border-2 border-border/60 bg-card p-4 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.topAgents}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip formatter={(v: number) => formatUGX(v)} />
            <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <SectionTitle>Revenue by Type</SectionTitle>
      <div className="space-y-2">
        {data.typeBreakdown.map(([type, amt]: [string, number]) => (
          <DataRow key={type} label={type} value={formatUGX(amt)} />
        ))}
      </div>

      <SectionTitle>Underperforming Agents</SectionTitle>
      <div className="space-y-2">
        {data.bottomAgents.map((a: any) => (
          <DataRow key={a.name} label={a.name} value={formatUGX(a.amount)} />
        ))}
        {data.bottomAgents.length === 0 && <DataRow label="No data" value="—" />}
      </div>
    </COODetailLayout>
  );
}
