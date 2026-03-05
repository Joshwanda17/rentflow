import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { Shield, Banknote, TrendingUp, Calendar, Wallet, PiggyBank } from 'lucide-react';
import { format } from 'date-fns';

export function PartnersOpsDashboard() {
  const { data: portfolios, isLoading } = useQuery({
    queryKey: ['exec-partner-portfolios'],
    queryFn: async () => {
      const { data } = await supabase.from('investor_portfolios').select('id, portfolio_code, investment_amount, roi_percentage, total_roi_earned, status, maturity_date, created_at')
        .order('created_at', { ascending: false }).limit(200);
      return data || [];
    },
    staleTime: 600000,
  });

  const rows = portfolios || [];
  const totalInvested = rows.reduce((s, p) => s + (p.investment_amount || 0), 0);
  const totalROI = rows.reduce((s, p) => s + (p.total_roi_earned || 0), 0);
  const activePortfolios = rows.filter(p => p.status === 'active').length;

  const columns: Column<any>[] = [
    { key: 'portfolio_code', label: 'Code' },
    { key: 'investment_amount', label: 'Invested', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'roi_percentage', label: 'ROI %', render: (v) => `${v}%` },
    { key: 'total_roi_earned', label: 'ROI Earned', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'status', label: 'Status', render: (v) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted'}`}>{String(v)}</span>
    )},
    { key: 'maturity_date', label: 'Maturity', render: (v) => v ? format(new Date(v as string), 'dd MMM yy') : '—' },
  ];

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard title="Total Partners" value={rows.length} icon={Shield} loading={isLoading} />
        <KPICard title="Active Portfolios" value={activePortfolios} icon={Wallet} loading={isLoading} color="bg-green-500/10 text-green-600" />
        <KPICard title="Total Invested" value={fmt(totalInvested)} icon={PiggyBank} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
        <KPICard title="Total ROI Earned" value={fmt(totalROI)} icon={TrendingUp} loading={isLoading} color="bg-emerald-500/10 text-emerald-600" />
        <KPICard title="Avg ROI %" value={rows.length ? `${(rows.reduce((s, p) => s + (p.roi_percentage || 0), 0) / rows.length).toFixed(1)}%` : '0%'} icon={Banknote} color="bg-purple-500/10 text-purple-600" />
        <KPICard title="Upcoming Maturity" value={rows.filter(p => p.maturity_date && new Date(p.maturity_date) > new Date()).length} icon={Calendar} color="bg-orange-500/10 text-orange-600" />
      </div>

      <ExecutiveDataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        title="Partner Portfolios"
        filters={[{
          key: 'status',
          label: 'Status',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'pending', label: 'Pending' },
            { value: 'matured', label: 'Matured' },
          ],
        }]}
      />
    </div>
  );
}
