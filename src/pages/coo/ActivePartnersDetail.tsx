import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import COODetailLayout, { KPICard, SectionTitle, DataRow } from '@/components/coo/COODetailLayout';
import { formatUGX } from '@/lib/rentCalculations';

export default function ActivePartnersDetail() {
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
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [activeRes, totalSupportersRes, fundedRes] = await Promise.all([
        supabase.from('rent_requests').select('supporter_id, rent_amount, funded_at')
          .not('supporter_id', 'is', null).in('status', ['funded', 'approved']),
        supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'supporter'),
        supabase.from('rent_requests').select('supporter_id, rent_amount')
          .not('supporter_id', 'is', null).eq('status', 'funded').gte('funded_at', thirtyDaysAgo),
      ]);

      const activeData = activeRes.data || [];
      const partnerMap = new Map<string, number>();
      activeData.forEach(r => {
        if (r.supporter_id) partnerMap.set(r.supporter_id, (partnerMap.get(r.supporter_id) || 0) + (r.rent_amount || 0));
      });

      const activePartners = partnerMap.size;
      const totalSupporters = totalSupportersRes.count || 0;
      const totalFunded = activeData.reduce((s, r) => s + (r.rent_amount || 0), 0);
      const recentFunded = (fundedRes.data || []).reduce((s, r) => s + (r.rent_amount || 0), 0);

      const sorted = Array.from(partnerMap.entries()).sort((a, b) => b[1] - a[1]);
      const topIds = sorted.slice(0, 5).map(s => s[0]);
      let nameMap = new Map<string, string>();
      if (topIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', topIds);
        nameMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
      }
      const topPartners = sorted.slice(0, 5).map(([id, amt]) => ({ name: nameMap.get(id) || id.slice(0, 8), amount: amt }));

      setData({ activePartners, totalSupporters, totalFunded, recentFunded, topPartners });
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  const status = data.activePartners > 3 ? 'green' as const : data.activePartners > 0 ? 'yellow' as const : 'red' as const;

  return (
    <COODetailLayout title="Active Partners" subtitle="Partner Performance & Contribution" status={status}>
      <div className="grid grid-cols-2 gap-3">
        <KPICard label="Active Partners" value={data.activePartners} status={status} />
        <KPICard label="Total Supporters" value={data.totalSupporters} status="green" />
        <KPICard label="Total Funded" value={formatUGX(data.totalFunded)} status="green" />
        <KPICard label="Recent (30D)" value={formatUGX(data.recentFunded)} status="green" />
      </div>

      <SectionTitle>Top Partners by Contribution</SectionTitle>
      <div className="space-y-2">
        {data.topPartners.map((p: any) => <DataRow key={p.name} label={p.name} value={formatUGX(p.amount)} />)}
        {data.topPartners.length === 0 && <DataRow label="No partner data" value="—" />}
      </div>

      <SectionTitle>Health Status</SectionTitle>
      <div className="space-y-2">
        <DataRow label="Partner Utilization" value={data.totalSupporters > 0 ? `${((data.activePartners / data.totalSupporters) * 100).toFixed(0)}%` : 'N/A'} />
        <DataRow label="Avg Funded / Partner" value={data.activePartners > 0 ? formatUGX(Math.round(data.totalFunded / data.activePartners)) : 'N/A'} />
      </div>
    </COODetailLayout>
  );
}
