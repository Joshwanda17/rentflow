import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { Home, Building2, Banknote, CheckCircle2, Clock, MapPin } from 'lucide-react';
import { format } from 'date-fns';

export function LandlordOpsDashboard() {
  const { data: landlords, isLoading } = useQuery({
    queryKey: ['exec-landlords-ops'],
    queryFn: async () => {
      const { data } = await supabase.from('landlords').select('id, name, phone, property_address, monthly_rent, verified, rent_balance_due, created_at')
        .order('created_at', { ascending: false }).limit(200);
      return data || [];
    },
    staleTime: 600000,
  });

  const rows = landlords || [];
  const verified = rows.filter(l => l.verified).length;
  const totalRentDue = rows.reduce((s, l) => s + (l.rent_balance_due || 0), 0);
  const totalMonthly = rows.reduce((s, l) => s + (l.monthly_rent || 0), 0);

  const columns: Column<any>[] = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'property_address', label: 'Property', className: 'max-w-[150px] truncate' },
    { key: 'monthly_rent', label: 'Monthly Rent', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'verified', label: 'Verified', render: (v) => v ? '✅' : '⏳' },
    { key: 'rent_balance_due', label: 'Balance Due', render: (v) => Number(v || 0).toLocaleString() },
  ];

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard title="Total Landlords" value={rows.length} icon={Home} loading={isLoading} />
        <KPICard title="Verified" value={verified} icon={CheckCircle2} loading={isLoading} color="bg-green-500/10 text-green-600" />
        <KPICard title="Unverified" value={rows.length - verified} icon={Clock} loading={isLoading} color="bg-amber-500/10 text-amber-600" />
        <KPICard title="Total Monthly Rent" value={fmt(totalMonthly)} icon={Banknote} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
        <KPICard title="Rent Balance Due" value={fmt(totalRentDue)} icon={Building2} loading={isLoading} color="bg-orange-500/10 text-orange-600" />
        <KPICard title="Properties" value={rows.length} icon={MapPin} loading={isLoading} color="bg-purple-500/10 text-purple-600" />
      </div>

      <ExecutiveDataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        title="Landlord Operations"
        filters={[{
          key: 'verified',
          label: 'Verified',
          options: [
            { value: 'true', label: 'Verified' },
            { value: 'false', label: 'Unverified' },
          ],
        }]}
      />
    </div>
  );
}
