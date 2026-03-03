import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import COODetailLayout, { KPICard, SectionTitle, DataRow } from '@/components/coo/COODetailLayout';
import { formatUGX } from '@/lib/rentCalculations';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function PipelineLandlordsDetail() {
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
      const [unverifiedRes, verifiedRes] = await Promise.all([
        supabase.from('landlords').select('id, name, property_address, monthly_rent, created_at, verified, desired_rent_from_welile')
          .eq('verified', false).order('created_at', { ascending: false }),
        supabase.from('landlords').select('id', { count: 'exact', head: true }).eq('verified', true),
      ]);

      const pipeline = unverifiedRes.data || [];
      const verifiedCount = verifiedRes.count || 0;
      const totalInPipeline = pipeline.length;
      const estimatedRevenue = pipeline.reduce((s, l) => s + (l.desired_rent_from_welile || l.monthly_rent || 0), 0);

      // Age breakdown
      const now = Date.now();
      let age = { week: 0, month: 0, older: 0 };
      pipeline.forEach(l => {
        const days = (now - new Date(l.created_at).getTime()) / (24 * 60 * 60 * 1000);
        if (days <= 7) age.week++;
        else if (days <= 30) age.month++;
        else age.older++;
      });

      const stageData = [
        { name: '< 7 days', count: age.week },
        { name: '7-30 days', count: age.month },
        { name: '30+ days', count: age.older },
      ];

      const recentList = pipeline.slice(0, 8).map(l => ({
        name: l.name,
        address: l.property_address,
        rent: l.monthly_rent || 0,
        daysAgo: Math.floor((now - new Date(l.created_at).getTime()) / (24 * 60 * 60 * 1000)),
      }));

      setData({ totalInPipeline, verifiedCount, estimatedRevenue, stageData, recentList, bottleneckOlder: age.older });
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  return (
    <COODetailLayout title="Landlords in Pipeline" subtitle="Onboarding Progress" status={data.totalInPipeline > 0 ? 'green' : 'yellow'}>
      <div className="grid grid-cols-2 gap-3">
        <KPICard label="In Pipeline" value={data.totalInPipeline} status={data.totalInPipeline > 0 ? 'green' : 'yellow'} />
        <KPICard label="Already Verified" value={data.verifiedCount} status="green" />
        <KPICard label="Est. Revenue" value={formatUGX(data.estimatedRevenue)} sub="Monthly potential" status="green" />
        <KPICard label="Bottleneck (30d+)" value={data.bottleneckOlder} status={data.bottleneckOlder > 3 ? 'red' : 'green'} sub="Stuck in pipeline" />
      </div>

      <SectionTitle>Onboarding Stage Breakdown</SectionTitle>
      <div className="rounded-2xl border-2 border-border/60 bg-card p-4 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.stageData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <SectionTitle>Recent Pipeline Entries</SectionTitle>
      <div className="space-y-2">
        {data.recentList.map((l: any, i: number) => (
          <DataRow key={i} label={`${l.name} — ${l.address}`} value={`${l.daysAgo}d ago`} />
        ))}
        {data.recentList.length === 0 && <DataRow label="No pipeline entries" value="—" />}
      </div>
    </COODetailLayout>
  );
}
