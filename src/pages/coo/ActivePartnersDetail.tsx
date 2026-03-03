import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import COODetailLayout, { KPICard, SectionTitle } from '@/components/coo/COODetailLayout';
import COODataTable, { COOColumn } from '@/components/coo/COODataTable';
import { formatUGX } from '@/lib/rentCalculations';

interface PartnerRow {
  name: string;
  funded: number;
  activeDeals: number;
  avgDeal: number;
  status: string;
}

const columns: COOColumn<PartnerRow>[] = [
  { key: 'name', label: 'Partner' },
  { key: 'funded', label: 'Total Funded', align: 'right', render: (r) => formatUGX(r.funded) },
  { key: 'activeDeals', label: 'Active Deals', align: 'right' },
  { key: 'avgDeal', label: 'Avg Deal', align: 'right', render: (r) => formatUGX(r.avgDeal) },
  { key: 'status', label: 'Status', render: (r) => (
    <span className={r.activeDeals > 2 ? 'text-emerald-600 font-semibold' : r.activeDeals > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground'}>
      {r.activeDeals > 2 ? 'Active' : r.activeDeals > 0 ? 'Low' : 'Inactive'}
    </span>
  )},
];

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

      const [activeRes, totalSupportersRes] = await Promise.all([
        supabase.from('rent_requests').select('supporter_id, rent_amount, funded_at, status')
          .not('supporter_id', 'is', null).in('status', ['funded', 'approved']),
        supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'supporter'),
      ]);

      const activeData = activeRes.data || [];
      const partnerMap = new Map<string, { funded: number; deals: number }>();
      activeData.forEach(r => {
        if (!r.supporter_id) return;
        const existing = partnerMap.get(r.supporter_id) || { funded: 0, deals: 0 };
        existing.funded += (r.rent_amount || 0);
        existing.deals += 1;
        partnerMap.set(r.supporter_id, existing);
      });

      const activePartners = partnerMap.size;
      const totalSupporters = totalSupportersRes.count || 0;
      const totalFunded = activeData.reduce((s, r) => s + (r.rent_amount || 0), 0);

      const allIds = Array.from(partnerMap.keys());
      let nameMap = new Map<string, string>();
      if (allIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', allIds.slice(0, 50));
        nameMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
      }

      const tableRows: PartnerRow[] = Array.from(partnerMap.entries())
        .map(([id, agg]) => ({
          name: nameMap.get(id) || id.slice(0, 8),
          funded: agg.funded,
          activeDeals: agg.deals,
          avgDeal: agg.deals > 0 ? Math.round(agg.funded / agg.deals) : 0,
          status: '',
        }))
        .sort((a, b) => b.funded - a.funded);

      setData({ activePartners, totalSupporters, totalFunded, tableRows });
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
        <KPICard label="Avg / Partner" value={data.activePartners > 0 ? formatUGX(Math.round(data.totalFunded / data.activePartners)) : 'N/A'} status="green" />
      </div>

      <COODataTable
        title="Partner Performance"
        columns={columns}
        data={data.tableRows}
        pageSize={15}
        exportFilename="active-partners"
      />
    </COODetailLayout>
  );
}
