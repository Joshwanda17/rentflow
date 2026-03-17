import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { Home, Building2, Banknote, CheckCircle2, Clock, MapPin, AlertTriangle, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export function LandlordOpsDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [verifying, setVerifying] = useState<string | null>(null);

  const { data: landlords, isLoading, refetch } = useQuery({
    queryKey: ['exec-landlords-ops'],
    queryFn: async () => {
      const { data } = await supabase.from('landlords')
        .select('id, name, phone, property_address, monthly_rent, verified, verified_by, verified_at, rent_balance_due, registered_by, created_at, region, district, village, number_of_houses, house_category, has_smartphone, mobile_money_name, mobile_money_number')
        .order('created_at', { ascending: false }).limit(500);
      return data || [];
    },
    staleTime: 60000, // Refresh more often for ops
  });

  const rows = landlords || [];
  const unverified = rows.filter(l => !l.verified);
  const verified = rows.filter(l => l.verified);
  const totalRentDue = rows.reduce((s, l) => s + (l.rent_balance_due || 0), 0);
  const totalMonthly = rows.reduce((s, l) => s + (l.monthly_rent || 0), 0);

  const handleVerify = async (landlordId: string) => {
    if (!user) return;
    setVerifying(landlordId);
    try {
      const { error } = await supabase.from('landlords')
        .update({ verified: true, verified_at: new Date().toISOString(), verified_by: user.id })
        .eq('id', landlordId);
      if (error) throw error;
      toast({ title: '✅ Landlord Verified', description: 'Landlord profile has been verified successfully.' });
      refetch();
    } catch (err: any) {
      toast({ title: 'Verification Failed', description: err.message, variant: 'destructive' });
    } finally {
      setVerifying(null);
    }
  };

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  // Verification queue columns - show the most important info for quick action
  const verificationColumns: Column<any>[] = [
    { key: 'name', label: 'Landlord', render: (v, row) => (
      <div>
        <p className="font-semibold text-sm">{v}</p>
        <p className="text-[10px] text-muted-foreground">{row.phone}</p>
      </div>
    )},
    { key: 'property_address', label: 'Property', className: 'max-w-[140px]', render: (v, row) => (
      <div>
        <p className="text-xs truncate">{v}</p>
        {row.district && <p className="text-[10px] text-muted-foreground">{row.district}{row.village ? `, ${row.village}` : ''}</p>}
      </div>
    )},
    { key: 'number_of_houses', label: 'Units', render: (v) => v || '—' },
    { key: 'house_category', label: 'Type', render: (v) => v ? <Badge variant="outline" className="text-[10px]">{v}</Badge> : '—' },
    { key: 'has_smartphone', label: 'Phone', render: (v) => v ? '📱' : '📵' },
    { key: 'mobile_money_name', label: 'MoMo', render: (v, row) => v ? (
      <div className="text-[10px]">
        <p className="font-medium">{v}</p>
        <p className="text-muted-foreground">{row.mobile_money_number}</p>
      </div>
    ) : <span className="text-muted-foreground text-xs">—</span> },
    { key: 'created_at', label: 'Registered', render: (v) => (
      <span className="text-xs text-muted-foreground">{format(new Date(v), 'MMM d, h:mm a')}</span>
    )},
    { key: 'id', label: 'Action', render: (v) => (
      <Button
        size="sm"
        variant="default"
        className="h-7 text-xs gap-1"
        onClick={() => handleVerify(v)}
        disabled={verifying === v}
      >
        {verifying === v ? (
          <div className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5" />
        )}
        Verify
      </Button>
    )},
  ];

  // All landlords table columns
  const allColumns: Column<any>[] = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'property_address', label: 'Property', className: 'max-w-[150px] truncate' },
    { key: 'monthly_rent', label: 'Monthly Rent', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'verified', label: 'Status', render: (v) => v ? <Badge className="bg-green-500/20 text-green-700 border-0">✅ Verified</Badge> : <Badge className="bg-amber-500/20 text-amber-700 border-0">⏳ Pending</Badge> },
    { key: 'rent_balance_due', label: 'Balance Due', render: (v) => Number(v || 0).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      {/* Priority Alert Banner */}
      {unverified.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3 animate-pulse-slow">
          <div className="p-2.5 rounded-xl bg-amber-500/20 shrink-0">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-amber-800 dark:text-amber-300 text-lg">
              🚨 {unverified.length} Landlord{unverified.length !== 1 ? 's' : ''} Pending Verification
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              These landlords were registered by agents/tenants and need immediate verification to unlock bonuses and activate properties.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPICard
          title="⚠️ Pending Verification"
          value={unverified.length}
          icon={Clock}
          loading={isLoading}
          color="bg-amber-500/20 text-amber-600"
          subtitle={unverified.length > 0 ? 'Action required!' : 'All clear'}
        />
        <KPICard title="Verified Landlords" value={verified.length} icon={CheckCircle2} loading={isLoading} color="bg-green-500/10 text-green-600" />
        <KPICard title="Total Landlords" value={rows.length} icon={Home} loading={isLoading} />
        <KPICard title="Total Monthly Rent" value={fmt(totalMonthly)} icon={Banknote} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
        <KPICard title="Rent Balance Due" value={fmt(totalRentDue)} icon={Building2} loading={isLoading} color="bg-orange-500/10 text-orange-600" />
        <KPICard title="Properties" value={rows.length} icon={MapPin} loading={isLoading} color="bg-purple-500/10 text-purple-600" />
      </div>

      {/* PRIORITY: Verification Queue */}
      {unverified.length > 0 && (
        <ExecutiveDataTable
          data={unverified}
          columns={verificationColumns}
          loading={isLoading}
          title={`🔥 Verification Queue (${unverified.length})`}
          filters={[
            {
              key: 'house_category',
              label: 'Type',
              options: [...new Set(unverified.map(l => l.house_category).filter(Boolean))].map(v => ({ value: v!, label: v! })),
            },
          ]}
        />
      )}

      {/* All Landlords Table */}
      <ExecutiveDataTable
        data={rows}
        columns={allColumns}
        loading={isLoading}
        title="All Landlords"
        filters={[{
          key: 'verified',
          label: 'Status',
          options: [
            { value: 'true', label: 'Verified' },
            { value: 'false', label: 'Unverified' },
          ],
        }]}
      />
    </div>
  );
}
