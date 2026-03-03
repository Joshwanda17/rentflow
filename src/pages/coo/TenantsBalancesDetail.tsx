import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import COODetailLayout, { KPICard, SectionTitle, DataRow } from '@/components/coo/COODetailLayout';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatUGX } from '@/lib/rentCalculations';

const COLORS = ['hsl(142, 71%, 45%)', 'hsl(45, 93%, 47%)', 'hsl(0, 84%, 60%)'];

export default function TenantsBalancesDetail() {
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
      const { data: requests } = await supabase.from('rent_requests')
        .select('id, tenant_id, total_repayment, amount_repaid, created_at, funded_at, status, rent_amount')
        .in('status', ['funded', 'approved']);

      const items = requests || [];
      const totalOutstanding = items.reduce((s, r) => s + ((r.total_repayment || 0) - (r.amount_repaid || 0)), 0);
      const totalRepaid = items.reduce((s, r) => s + (r.amount_repaid || 0), 0);
      const totalExpected = items.reduce((s, r) => s + (r.total_repayment || 0), 0);
      const collectionRate = totalExpected > 0 ? ((totalRepaid / totalExpected) * 100).toFixed(1) : '0';

      // Aging: based on funded_at
      const now = Date.now();
      let aging = { current: 0, days30: 0, days60plus: 0 };
      items.forEach(r => {
        const outstanding = (r.total_repayment || 0) - (r.amount_repaid || 0);
        if (outstanding <= 0) return;
        const fundedAt = r.funded_at ? new Date(r.funded_at).getTime() : now;
        const daysSince = (now - fundedAt) / (24 * 60 * 60 * 1000);
        if (daysSince <= 30) aging.current += outstanding;
        else if (daysSince <= 60) aging.days30 += outstanding;
        else aging.days60plus += outstanding;
      });

      const agingChart = [
        { name: '0-30 days', value: aging.current },
        { name: '31-60 days', value: aging.days30 },
        { name: '60+ days', value: aging.days60plus },
      ].filter(a => a.value > 0);

      // High risk: largest outstanding
      const tenantMap = new Map<string, number>();
      items.forEach(r => {
        const out = (r.total_repayment || 0) - (r.amount_repaid || 0);
        if (out > 0) tenantMap.set(r.tenant_id, (tenantMap.get(r.tenant_id) || 0) + out);
      });
      const sortedTenants = Array.from(tenantMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      let nameMap = new Map<string, string>();
      if (sortedTenants.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', sortedTenants.map(s => s[0]));
        nameMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
      }
      const highRisk = sortedTenants.map(([id, amt]) => ({ name: nameMap.get(id) || id.slice(0, 8), amount: amt }));

      setData({ count: items.length, totalOutstanding, collectionRate, agingChart, highRisk, totalRepaid });
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  return (
    <COODetailLayout title="Tenants With Balances" subtitle="Outstanding Obligations" status={data.count > 0 ? 'green' : 'yellow'}>
      <div className="grid grid-cols-2 gap-3">
        <KPICard label="Active Obligations" value={data.count} status="green" />
        <KPICard label="Total Outstanding" value={formatUGX(data.totalOutstanding)} status={data.totalOutstanding > 5000000 ? 'yellow' : 'green'} />
        <KPICard label="Collection Rate" value={`${data.collectionRate}%`} status={Number(data.collectionRate) > 50 ? 'green' : 'red'} />
        <KPICard label="Total Repaid" value={formatUGX(data.totalRepaid)} status="green" />
      </div>

      <SectionTitle>Aging Breakdown</SectionTitle>
      {data.agingChart.length > 0 ? (
        <div className="rounded-2xl border-2 border-border/60 bg-card p-4 h-52 flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data.agingChart} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name }) => name}>
                {data.agingChart.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatUGX(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : <DataRow label="No aging data" value="—" />}

      <SectionTitle>Risk Exposure</SectionTitle>
      <div className="space-y-2">
        <DataRow label="0-30 Days" value={formatUGX(data.agingChart.find((a: any) => a.name === '0-30 days')?.value || 0)} />
        <DataRow label="31-60 Days" value={formatUGX(data.agingChart.find((a: any) => a.name === '31-60 days')?.value || 0)} />
        <DataRow label="60+ Days" value={formatUGX(data.agingChart.find((a: any) => a.name === '60+ days')?.value || 0)} highlight />
      </div>

      <SectionTitle>High-Risk Accounts</SectionTitle>
      <div className="space-y-2">
        {data.highRisk.map((t: any) => <DataRow key={t.name} label={t.name} value={formatUGX(t.amount)} />)}
        {data.highRisk.length === 0 && <DataRow label="No high-risk accounts" value="—" />}
      </div>
    </COODetailLayout>
  );
}
