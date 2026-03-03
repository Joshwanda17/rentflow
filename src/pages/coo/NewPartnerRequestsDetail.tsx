import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import COODetailLayout, { KPICard, SectionTitle, DataRow } from '@/components/coo/COODetailLayout';

export default function NewPartnerRequestsDetail() {
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
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [weekRes, monthRes, allRes] = await Promise.all([
        supabase.from('user_roles').select('user_id, created_at').eq('role', 'supporter').gte('created_at', sevenDaysAgo),
        supabase.from('user_roles').select('user_id, created_at').eq('role', 'supporter').gte('created_at', thirtyDaysAgo),
        supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'supporter'),
      ]);

      const weekRequests = weekRes.data || [];
      const monthRequests = monthRes.data || [];
      const totalSupporters = allRes.count || 0;

      // Get names
      const ids = weekRequests.map(r => r.user_id);
      let nameMap = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
        nameMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
      }

      const recentList = weekRequests.map(r => ({
        name: nameMap.get(r.user_id) || r.user_id.slice(0, 8),
        date: new Date(r.created_at).toLocaleDateString('en-UG', { day: 'numeric', month: 'short' }),
      }));

      setData({
        thisWeek: weekRequests.length,
        thisMonth: monthRequests.length,
        totalSupporters,
        recentList,
      });
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  return (
    <COODetailLayout title="New Partner Requests" subtitle="Supporter Pipeline" status={data.thisWeek > 0 ? 'green' : 'yellow'}>
      <div className="grid grid-cols-2 gap-3">
        <KPICard label="This Week" value={data.thisWeek} status={data.thisWeek > 0 ? 'green' : 'yellow'} />
        <KPICard label="This Month" value={data.thisMonth} status="green" />
        <KPICard label="Total Supporters" value={data.totalSupporters} status="green" />
        <KPICard label="Growth Rate" value={data.totalSupporters > 0 ? `${((data.thisMonth / data.totalSupporters) * 100).toFixed(0)}%` : '0%'} sub="Monthly" status="green" />
      </div>

      <SectionTitle>Recent Signups</SectionTitle>
      <div className="space-y-2">
        {data.recentList.map((r: any, i: number) => (
          <DataRow key={i} label={r.name} value={r.date} />
        ))}
        {data.recentList.length === 0 && <DataRow label="No recent signups" value="—" />}
      </div>
    </COODetailLayout>
  );
}
