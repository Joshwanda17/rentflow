import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import COODetailLayout, { KPICard, SectionTitle, DataRow } from '@/components/coo/COODetailLayout';
import { formatUGX } from '@/lib/rentCalculations';

export default function ActiveLandlordsDetail() {
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

      const [landlordRes, activeRentRes, totalLandlordsRes] = await Promise.all([
        supabase.from('landlords').select('id, name, property_address, monthly_rent, number_of_rooms, verified'),
        supabase.from('rent_requests').select('landlord_id, rent_amount')
          .in('status', ['funded', 'disbursed']).gte('funded_at', thirtyDaysAgo),
        supabase.from('landlords').select('id', { count: 'exact', head: true }),
      ]);

      const landlords = landlordRes.data || [];
      const rentData = activeRentRes.data || [];
      const totalLandlords = totalLandlordsRes.count || 0;

      // Revenue per landlord
      const landlordRevenueMap = new Map<string, number>();
      rentData.forEach(r => {
        landlordRevenueMap.set(r.landlord_id, (landlordRevenueMap.get(r.landlord_id) || 0) + (r.rent_amount || 0));
      });
      const activeLandlords = landlordRevenueMap.size;
      const totalRevenue = rentData.reduce((s, r) => s + (r.rent_amount || 0), 0);
      const avgRevenue = activeLandlords > 0 ? totalRevenue / activeLandlords : 0;
      const totalRooms = landlords.reduce((s, l) => s + (l.number_of_rooms || 0), 0);
      const verifiedCount = landlords.filter(l => l.verified).length;

      // Top landlords by revenue
      const sorted = Array.from(landlordRevenueMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const landlordNameMap = new Map(landlords.map(l => [l.id, l.name]));
      const topLandlords = sorted.map(([id, amt]) => ({ name: landlordNameMap.get(id) || id.slice(0, 8), amount: amt }));

      setData({ activeLandlords, totalLandlords, totalRevenue, avgRevenue, totalRooms, verifiedCount, topLandlords });
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  }

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  const status = data.activeLandlords > 3 ? 'green' as const : data.activeLandlords > 0 ? 'yellow' as const : 'red' as const;

  return (
    <COODetailLayout title="Active Landlords" subtitle="Landlord Performance (30D)" status={status}>
      <div className="grid grid-cols-2 gap-3">
        <KPICard label="Active Landlords" value={data.activeLandlords} status={status} />
        <KPICard label="Total Landlords" value={data.totalLandlords} status="green" />
        <KPICard label="Revenue (30D)" value={formatUGX(data.totalRevenue)} status="green" />
        <KPICard label="Avg / Landlord" value={formatUGX(Math.round(data.avgRevenue))} status="green" />
      </div>

      <SectionTitle>Portfolio Overview</SectionTitle>
      <div className="space-y-2">
        <DataRow label="Total Properties" value={data.totalLandlords} />
        <DataRow label="Total Rooms" value={data.totalRooms} />
        <DataRow label="Verified Landlords" value={data.verifiedCount} highlight />
      </div>

      <SectionTitle>Top Landlords by Revenue</SectionTitle>
      <div className="space-y-2">
        {data.topLandlords.map((l: any) => <DataRow key={l.name} label={l.name} value={formatUGX(l.amount)} />)}
        {data.topLandlords.length === 0 && <DataRow label="No data" value="—" />}
      </div>
    </COODetailLayout>
  );
}
