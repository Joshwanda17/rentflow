import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import COODetailLayout, { KPICard, SectionTitle, DataRow } from '@/components/coo/COODetailLayout';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatUGX } from '@/lib/rentCalculations';

export default function NewRentRequestsDetail() {
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
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [recentRes, statusRes] = await Promise.all([
        supabase.from('rent_requests')
          .select('id, status, rent_amount, access_fee, request_fee, total_repayment, created_at, approved_at, funded_at, tenant_id, agent_id, tenant_no_smartphone')
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false }),
        supabase.from('rent_requests')
          .select('status', { count: 'exact' })
          .gte('created_at', thirtyDaysAgo),
      ]);

      const requests = recentRes.data || [];
      const total = requests.length;
      const pending = requests.filter(r => r.status === 'pending').length;
      const approved = requests.filter(r => r.status === 'approved').length;
      const funded = requests.filter(r => r.status === 'funded').length;
      const rejected = requests.filter(r => r.status === 'rejected').length;
      const conversionRate = total > 0 ? ((funded / total) * 100).toFixed(1) : '0';
      const totalRevenuePotential = requests.filter(r => r.status !== 'rejected')
        .reduce((s, r) => s + (r.access_fee || 0) + (r.request_fee || 0), 0);

      // Average approval time
      const approvedWithTime = requests.filter(r => r.approved_at && r.created_at);
      const avgApprovalHrs = approvedWithTime.length > 0
        ? (approvedWithTime.reduce((s, r) => s + (new Date(r.approved_at!).getTime() - new Date(r.created_at).getTime()), 0) / approvedWithTime.length / 3600000).toFixed(1)
        : 'N/A';

      const funnelData = [
        { name: 'Pending', count: pending },
        { name: 'Approved', count: approved },
        { name: 'Funded', count: funded },
        { name: 'Rejected', count: rejected },
      ];

      setData({ total, pending, approved, funded, rejected, conversionRate, avgApprovalHrs, totalRevenuePotential, funnelData });
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  return (
    <COODetailLayout title="New Rent Requests" subtitle="30-Day Funnel Analysis" status={data.total > 0 ? 'green' : 'yellow'}>
      <div className="grid grid-cols-2 gap-3">
        <KPICard label="Total Requests (30D)" value={data.total} status="green" />
        <KPICard label="Conversion Rate" value={`${data.conversionRate}%`} status={Number(data.conversionRate) > 30 ? 'green' : 'yellow'} />
        <KPICard label="Avg Approval Time" value={data.avgApprovalHrs === 'N/A' ? 'N/A' : `${data.avgApprovalHrs}h`} status={data.avgApprovalHrs !== 'N/A' && Number(data.avgApprovalHrs) < 48 ? 'green' : 'yellow'} />
        <KPICard label="Revenue Potential" value={formatUGX(data.totalRevenuePotential)} status="green" />
      </div>

      <SectionTitle>Request Funnel</SectionTitle>
      <div className="rounded-2xl border-2 border-border/60 bg-card p-4 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.funnelData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={70} />
            <Tooltip />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <SectionTitle>Status Breakdown</SectionTitle>
      <div className="space-y-2">
        <DataRow label="Pending" value={data.pending} />
        <DataRow label="Approved" value={data.approved} />
        <DataRow label="Funded" value={data.funded} highlight />
        <DataRow label="Rejected" value={data.rejected} />
      </div>
    </COODetailLayout>
  );
}
