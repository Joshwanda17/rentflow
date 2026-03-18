import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { Shield, Banknote, TrendingUp, Calendar, Wallet, PiggyBank, AlertCircle, Pencil, PlusCircle, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { PendingWalletOperationsWidget } from '@/components/manager/PendingWalletOperationsWidget';
import { ROIPaymentHistory } from './ROIPaymentHistory';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { EditInvestmentAccountDialog } from '@/components/manager/EditInvestmentAccountDialog';
import { FundInvestmentAccountDialog } from '@/components/manager/FundInvestmentAccountDialog';
import { CreateInvestmentAccountDialog } from '@/components/manager/CreateInvestmentAccountDialog';

export function PartnersOpsDashboard() {
  const [editAccount, setEditAccount] = useState<any>(null);
  const [fundAccount, setFundAccount] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForUser, setCreateForUser] = useState<{ id: string; name: string } | null>(null);

  const { data: portfolios, isLoading, refetch } = useQuery({
    queryKey: ['exec-partner-portfolios'],
    queryFn: async () => {
      const { data } = await supabase.from('investor_portfolios')
        .select('id, portfolio_code, account_name, investment_amount, roi_percentage, total_roi_earned, status, maturity_date, created_at, investor_id, agent_id, display_currency, payment_method, mobile_money_number, mobile_network, bank_name, account_number, payout_day')
        .order('created_at', { ascending: false }).limit(200);

      if (!data) return [];

      // Resolve names
      const ids = new Set<string>();
      data.forEach(p => { if (p.investor_id) ids.add(p.investor_id); ids.add(p.agent_id); });
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', Array.from(ids));
      const nameMap = new Map<string, string>();
      (profiles || []).forEach(p => nameMap.set(p.id, p.full_name));

      return data.map(p => ({
        ...p,
        investor_name: p.investor_id ? nameMap.get(p.investor_id) || '—' : '—',
        agent_name: nameMap.get(p.agent_id) || '—',
      }));
    },
    staleTime: 600000,
  });

  const rows = portfolios || [];
  const totalInvested = rows.reduce((s, p) => s + (p.investment_amount || 0), 0);
  const totalROI = rows.reduce((s, p) => s + (p.total_roi_earned || 0), 0);
  const activePortfolios = rows.filter(p => p.status === 'active').length;
  const pendingApproval = rows.filter(p => p.status === 'pending_approval').length;

  const columns: Column<any>[] = [
    { key: 'portfolio_code', label: 'Code' },
    { key: 'account_name', label: 'Account Name', render: (v) => v ? String(v) : <span className="text-muted-foreground italic text-xs">Not set</span> },
    { key: 'investor_name', label: 'Partner' },
    { key: 'investment_amount', label: 'Invested', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'roi_percentage', label: 'ROI %', render: (v) => `${v}%` },
    { key: 'total_roi_earned', label: 'ROI Earned', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'status', label: 'Status', render: (v) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        v === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
        v === 'pending_approval' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-bold animate-pulse' :
        'bg-muted'
      }`}>{String(v === 'pending_approval' ? '⏳ Pending' : v)}</span>
    )},
    { key: 'maturity_date', label: 'Maturity', render: (v) => v ? format(new Date(v as string), 'dd MMM yy') : '—' },
    { key: 'id', label: 'Actions', sortable: false, render: (_v, row) => (
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary hover:text-primary" onClick={(e) => { e.stopPropagation(); setEditAccount(row); }}
          title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-success hover:text-success" onClick={(e) => { e.stopPropagation(); setFundAccount(row); }}
          title="Top Up">
          <PlusCircle className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={(e) => {
          e.stopPropagation();
          setCreateForUser({ id: row.investor_id || row.agent_id, name: row.investor_name || row.agent_name });
          setCreateOpen(true);
        }} title="New Account for Partner">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    )},
  ];

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  return (
    <div className="space-y-6">
      <PendingWalletOperationsWidget />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {pendingApproval > 0 && (
          <KPICard title="⚠️ Pending Approval" value={pendingApproval} icon={AlertCircle} loading={isLoading} color="bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/40" />
        )}
        <KPICard title="Total Partners" value={rows.length} icon={Shield} loading={isLoading} />
        <KPICard title="Active Portfolios" value={activePortfolios} icon={Wallet} loading={isLoading} color="bg-green-500/10 text-green-600" />
        <KPICard title="Total Invested" value={fmt(totalInvested)} icon={PiggyBank} loading={isLoading} color="bg-blue-500/10 text-blue-600" />
        <KPICard title="Total ROI Earned" value={fmt(totalROI)} icon={TrendingUp} loading={isLoading} color="bg-emerald-500/10 text-emerald-600" />
        <KPICard title="Avg ROI %" value={rows.length ? `${(rows.reduce((s, p) => s + (p.roi_percentage || 0), 0) / rows.length).toFixed(1)}%` : '0%'} icon={Banknote} color="bg-purple-500/10 text-purple-600" />
        <KPICard title="Upcoming Maturity" value={rows.filter(p => p.maturity_date && new Date(p.maturity_date) > new Date()).length} icon={Calendar} color="bg-orange-500/10 text-orange-600" />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => { setCreateForUser(null); setCreateOpen(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Portfolio
        </Button>
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
            { value: 'pending_approval', label: '⏳ Pending Approval' },
            { value: 'pending', label: 'Pending' },
            { value: 'matured', label: 'Matured' },
            { value: 'cancelled', label: 'Cancelled' },
          ],
        }]}
      />

      <Separator className="my-2" />
      <ROIPaymentHistory />

      {/* Dialogs */}
      <EditInvestmentAccountDialog
        open={!!editAccount}
        onOpenChange={(v) => { if (!v) setEditAccount(null); }}
        account={editAccount}
        onSuccess={() => refetch()}
      />
      <FundInvestmentAccountDialog
        open={!!fundAccount}
        onOpenChange={(v) => { if (!v) setFundAccount(null); }}
        account={fundAccount}
        onSuccess={() => refetch()}
      />
      <CreateInvestmentAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => refetch()}
        prefillInvestorId={createForUser?.id}
        prefillInvestorName={createForUser?.name}
      />
    </div>
  );
}
