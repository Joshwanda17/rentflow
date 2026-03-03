import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import COODetailLayout, { KPICard, SectionTitle, DataRow } from '@/components/coo/COODetailLayout';
import { formatUGX } from '@/lib/rentCalculations';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type HealthStatus = 'green' | 'yellow' | 'red';

export default function RentCoverageDetail() {
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
      const [activeRes, repaymentRes, repaymentsHistoryRes] = await Promise.all([
        supabase.from('rent_requests').select('id, total_repayment, amount_repaid, rent_amount, access_fee, request_fee, funded_at')
          .in('status', ['funded', 'approved']),
        supabase.from('repayments').select('amount, created_at')
          .order('created_at', { ascending: true }),
        supabase.from('rent_requests').select('total_repayment, amount_repaid')
          .in('status', ['funded', 'approved']),
      ]);

      const active = activeRes.data || [];
      const repayments = repaymentRes.data || [];

      const totalObligations = active.reduce((s, r) => s + (r.total_repayment || 0), 0);
      const totalRepaid = active.reduce((s, r) => s + (r.amount_repaid || 0), 0);
      const outstanding = totalObligations - totalRepaid;
      const totalFees = active.reduce((s, r) => s + (r.access_fee || 0) + (r.request_fee || 0), 0);
      const coverageRatio = outstanding > 0 ? (totalRepaid / totalObligations) : 1;

      let coverageStatus: HealthStatus = 'green';
      let coverageLabel = 'Safe';
      if (coverageRatio < 0.3) { coverageStatus = 'red'; coverageLabel = 'Dangerous'; }
      else if (coverageRatio < 0.6) { coverageStatus = 'yellow'; coverageLabel = 'Tight'; }

      // Build repayment trend (last 30 days, grouped by day)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const dailyMap = new Map<string, number>();
      repayments.filter(r => new Date(r.created_at).getTime() > thirtyDaysAgo).forEach(r => {
        const day = r.created_at.split('T')[0];
        dailyMap.set(day, (dailyMap.get(day) || 0) + r.amount);
      });

      const trendData = Array.from(dailyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-14)
        .map(([date, amount]) => ({
          name: new Date(date).toLocaleDateString('en-UG', { day: 'numeric', month: 'short' }),
          amount,
        }));

      setData({
        coverageRatio: (coverageRatio * 100).toFixed(1),
        coverageStatus,
        coverageLabel,
        totalObligations,
        totalRepaid,
        outstanding,
        totalFees,
        activeCount: active.length,
        trendData,
      });
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  return (
    <COODetailLayout title="Rent Coverage" subtitle="Solvency & Liquidity" status={data.coverageStatus}>
      <div className="grid grid-cols-2 gap-3">
        <KPICard label="Coverage Ratio" value={`${data.coverageRatio}%`} status={data.coverageStatus} sub={data.coverageLabel} />
        <KPICard label="Active Obligations" value={data.activeCount} status="green" />
        <KPICard label="Outstanding" value={formatUGX(data.outstanding)} status={data.coverageStatus} />
        <KPICard label="Total Fees Earned" value={formatUGX(data.totalFees)} status="green" />
      </div>

      <SectionTitle>Repayment Trend (14D)</SectionTitle>
      {data.trendData.length > 0 ? (
        <div className="rounded-2xl border-2 border-border/60 bg-card p-4 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v: number) => formatUGX(v)} />
              <Area type="monotone" dataKey="amount" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <DataRow label="No repayment data yet" value="—" />}

      <SectionTitle>Liquidity Metrics</SectionTitle>
      <div className="space-y-2">
        <DataRow label="Total Obligations" value={formatUGX(data.totalObligations)} />
        <DataRow label="Total Repaid" value={formatUGX(data.totalRepaid)} highlight />
        <DataRow label="Outstanding Balance" value={formatUGX(data.outstanding)} />
        <DataRow label="Fee Revenue" value={formatUGX(data.totalFees)} />
      </div>

      {data.coverageStatus === 'red' && (
        <>
          <SectionTitle>⚠️ Risk Alert</SectionTitle>
          <div className="rounded-2xl border-2 border-red-500/40 bg-red-500/8 p-4">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              Coverage ratio is critically low. Consider pausing new rent approvals until repayment collection improves.
            </p>
          </div>
        </>
      )}
    </COODetailLayout>
  );
}
