import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPICard } from './KPICard';
import { ExecutiveDataTable, Column } from './ExecutiveDataTable';
import { Shield, Banknote, TrendingUp, Calendar, Wallet, PiggyBank, AlertCircle, Pencil, PlusCircle, Plus, RefreshCw, Zap, Bell, CheckCircle2, CalendarClock } from 'lucide-react';
import { format, formatDistanceToNow, addMonths } from 'date-fns';
import { PendingWalletOperationsWidget } from '@/components/manager/PendingWalletOperationsWidget';
import { ROIPaymentHistory } from './ROIPaymentHistory';
import { Separator } from '@/components/ui/separator';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { EditInvestmentAccountDialog } from '@/components/manager/EditInvestmentAccountDialog';
import { FundInvestmentAccountDialog } from '@/components/manager/FundInvestmentAccountDialog';
import { CreateInvestmentAccountDialog } from '@/components/manager/CreateInvestmentAccountDialog';
import { ChangeMaturityDateDialog } from './ChangeMaturityDateDialog';

export function PartnersOpsDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editAccount, setEditAccount] = useState<any>(null);
  const [fundAccount, setFundAccount] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForUser, setCreateForUser] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState(false);
  const [maturityAccount, setMaturityAccount] = useState<any>(null);
  const autoRenewedRef = useRef(false);

  const { data: portfolios, isLoading, refetch } = useQuery({
    queryKey: ['exec-partner-portfolios'],
    queryFn: async () => {
      const { data } = await supabase.from('investor_portfolios')
        .select('id, portfolio_code, account_name, investment_amount, roi_percentage, total_roi_earned, status, maturity_date, created_at, investor_id, agent_id, display_currency, payment_method, mobile_money_number, mobile_network, bank_name, bank_account_name, account_number, payout_day, auto_reinvest, duration_months')
        .order('created_at', { ascending: false }).limit(200);

      if (!data) return [];

      const ids = new Set<string>();
      data.forEach(p => { if (p.investor_id) ids.add(p.investor_id); ids.add(p.agent_id); });
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', Array.from(ids));
      const nameMap = new Map<string, string>();
      (profiles || []).forEach(p => nameMap.set(p.id, p.full_name));

      return data.map(p => ({
        ...p,
        investor_name: p.investor_id ? nameMap.get(p.investor_id) || '—' : '—',
        agent_name: nameMap.get(p.agent_id) || '—',
        health_score: computeHealth(p),
      }));
    },
    staleTime: 600000,
  });

  // Escalations — no limit, show all open
  const { data: escalations } = useQuery({
    queryKey: ['partner-escalations'],
    queryFn: async () => {
      const { data } = await supabase.from('partner_escalations')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      return data || [];
    },
    staleTime: 300000,
  });

  const rows = portfolios || [];
  const totalInvested = rows.reduce((s, p) => s + (p.investment_amount || 0), 0);
  const totalROI = rows.reduce((s, p) => s + (p.total_roi_earned || 0), 0);
  const activePortfolios = rows.filter(p => p.status === 'active').length;
  const pendingApproval = rows.filter(p => p.status === 'pending_approval').length;
  const openEscalations = (escalations || []).length;

  // ═══ AUTO-RENEW MATURED PORTFOLIOS ═══
  useEffect(() => {
    if (autoRenewedRef.current || !portfolios || portfolios.length === 0) return;
    const matured = portfolios.filter(p => p.status === 'matured');
    if (matured.length === 0) return;

    autoRenewedRef.current = true;

    const autoRenew = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      let renewed = 0;

      for (const p of matured) {
        const newMaturity = format(addMonths(new Date(), p.duration_months || 12), 'yyyy-MM-dd');

        const { error } = await supabase.from('investor_portfolios')
          .update({ status: 'active', maturity_date: newMaturity })
          .eq('id', p.id);

        if (!error) {
          await supabase.from('portfolio_renewals').insert({
            portfolio_id: p.id,
            renewed_by: user?.id || 'system',
            reason: 'Auto-renewed on maturity (system)',
            old_maturity_date: p.maturity_date,
            new_maturity_date: newMaturity,
            old_created_at: p.created_at,
            new_created_at: new Date().toISOString(),
            old_duration_months: p.duration_months || 12,
            new_duration_months: p.duration_months || 12,
            old_roi_percentage: p.roi_percentage,
            new_roi_percentage: p.roi_percentage,
            top_up_amount: 0,
          });

          // Auto-close related escalations
          await supabase.from('partner_escalations')
            .update({ status: 'auto_resolved', resolved_at: new Date().toISOString() })
            .eq('portfolio_id', p.id)
            .eq('status', 'open')
            .in('escalation_type', ['maturity_expired', 'maturity_30d', 'maturity_7d']);

          renewed++;
        }
      }

      if (renewed > 0) {
        toast({ title: `${renewed} matured portfolio(s) auto-renewed`, description: 'History preserved · escalations auto-resolved' });
        refetch();
        queryClient.invalidateQueries({ queryKey: ['partner-escalations'] });
      }
    };

    autoRenew();
  }, [portfolios]);

  const toggleAutoReinvest = async (id: string, current: boolean) => {
    const { error } = await supabase.from('investor_portfolios')
      .update({ auto_reinvest: !current }).eq('id', id);
    if (error) {
      toast({ title: 'Update failed', variant: 'destructive' });
    } else {
      toast({ title: `Auto-reinvest ${!current ? 'enabled' : 'disabled'}` });
      refetch();
    }
  };

  const acknowledgeEscalation = async (id: string) => {
    await supabase.from('partner_escalations')
      .update({ status: 'acknowledged', resolved_at: new Date().toISOString() })
      .eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['partner-escalations'] });
    toast({ title: 'Escalation acknowledged' });
  };

  const approvePortfolioFromEscalation = async (esc: any) => {
    const portfolioId = esc.portfolio_id;
    const { error } = await supabase.from('investor_portfolios')
      .update({ status: 'active' })
      .eq('id', portfolioId);
    if (error) {
      toast({ title: 'Approval failed', variant: 'destructive' });
      return;
    }
    // Close escalation
    await supabase.from('partner_escalations')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', esc.id);
    // Close any other stale_approval escalations for this portfolio
    await supabase.from('partner_escalations')
      .update({ status: 'auto_resolved', resolved_at: new Date().toISOString() })
      .eq('portfolio_id', portfolioId)
      .eq('escalation_type', 'stale_approval')
      .eq('status', 'open');
    // Audit log
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action_type: 'portfolio_approved_from_escalation',
      table_name: 'investor_portfolios',
      record_id: portfolioId,
      metadata: { escalation_id: esc.id, portfolio_code: (esc.details as any)?.portfolio_code },
    });
    queryClient.invalidateQueries({ queryKey: ['partner-escalations'] });
    refetch();
    toast({ title: 'Portfolio approved & escalation resolved' });
  };

  const bulkResolveEscalations = async (type: string) => {
    const toResolve = (escalations || []).filter(e => e.escalation_type === type);
    if (toResolve.length === 0) return;
    const ids = toResolve.map(e => e.id);
    await supabase.from('partner_escalations')
      .update({ status: 'acknowledged', resolved_at: new Date().toISOString() })
      .in('id', ids);
    queryClient.invalidateQueries({ queryKey: ['partner-escalations'] });
    toast({ title: `${ids.length} ${type.replace('_', ' ')} escalations resolved` });
  };

  const getEscalationSeverity = (esc: any): 'critical' | 'warning' | 'info' => {
    const hours = (esc.details as any)?.hours_pending;
    if (esc.escalation_type === 'stale_approval') {
      if (hours && hours > 168) return 'critical'; // > 7 days
      if (hours && hours > 72) return 'warning';
      return 'info';
    }
    const days = (esc.details as any)?.days_remaining;
    if (days && days <= 3) return 'critical';
    if (days && days <= 7) return 'warning';
    return 'info';
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkCurrencyUpdate = async (currency: string) => {
    if (selectedIds.size === 0) return;
    const { error } = await supabase.from('investor_portfolios')
      .update({ display_currency: currency })
      .in('id', Array.from(selectedIds));
    if (error) {
      toast({ title: 'Bulk update failed', variant: 'destructive' });
    } else {
      toast({ title: `${selectedIds.size} portfolios updated to ${currency}` });
      setSelectedIds(new Set());
      setBulkAction(false);
      refetch();
    }
  };

  const handleBulkAutoReinvest = async (enabled: boolean) => {
    if (selectedIds.size === 0) return;
    const { error } = await supabase.from('investor_portfolios')
      .update({ auto_reinvest: enabled })
      .in('id', Array.from(selectedIds));
    if (error) {
      toast({ title: 'Bulk update failed', variant: 'destructive' });
    } else {
      toast({ title: `Auto-reinvest ${enabled ? 'enabled' : 'disabled'} for ${selectedIds.size} portfolios` });
      setSelectedIds(new Set());
      setBulkAction(false);
      refetch();
    }
  };

  const columns: Column<any>[] = [
    ...(bulkAction ? [{
      key: 'id' as const, label: '☑', sortable: false,
      render: (v: any, row: any) => (
        <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelect(row.id)}
          className="h-4 w-4 rounded border-border accent-primary" />
      ),
      className: 'w-8',
    }] : []),
    { key: 'portfolio_code', label: 'Code' },
    { key: 'account_name', label: 'Account', render: (v) => v ? String(v) : <span className="text-muted-foreground italic text-xs">—</span> },
    { key: 'investor_name', label: 'Partner' },
    { key: 'investment_amount', label: 'Invested', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'roi_percentage', label: 'ROI%', render: (v) => `${v}%` },
    { key: 'total_roi_earned', label: 'Earned', render: (v) => Number(v || 0).toLocaleString() },
    { key: 'payment_method', label: 'Payout', sortable: false, render: (v, row) => {
      const method = String(v || 'none');
      if (method === 'bank_transfer') return (
        <span className="text-[10px] font-medium">🏦 {row.bank_name ? String(row.bank_name).split(' ').slice(0, 2).join(' ') : 'Bank'}</span>
      );
      if (method === 'mobile_money') return (
        <span className="text-[10px] font-medium">📱 {row.mobile_network || 'MoMo'}</span>
      );
      if (method === 'cash') return <span className="text-[10px] font-medium">💵 Cash</span>;
      return <span className="text-[10px] text-muted-foreground italic">Not set</span>;
    }},
    { key: 'health_score', label: 'Health', sortable: false, render: (v) => {
      const score = Number(v);
      const color = score >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : score >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      return <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{score}%</span>;
    }},
    { key: 'auto_reinvest', label: 'Reinvest', sortable: false, render: (v, row) => (
      <Switch checked={!!v} onCheckedChange={() => toggleAutoReinvest(row.id, !!v)} className="scale-75" />
    )},
    { key: 'status', label: 'Status', render: (v) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
        v === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
        v === 'pending_approval' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-bold animate-pulse' :
        v === 'matured' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
        'bg-muted'
      }`}>{String(v === 'pending_approval' ? '⏳ Pending' : v)}</span>
    )},
    { key: 'maturity_date', label: 'Maturity', render: (v) => v ? format(new Date(v as string), 'dd MMM yy') : '—' },
    { key: 'id', label: 'Actions', sortable: false, render: (_v, row) => (
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary hover:text-primary" onClick={(e) => { e.stopPropagation(); setEditAccount(row); }} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-success hover:text-success" onClick={(e) => { e.stopPropagation(); setFundAccount(row); }} title="Top Up">
          <PlusCircle className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={(e) => {
          e.stopPropagation();
          setCreateForUser({ id: row.investor_id || row.agent_id, name: row.investor_name || row.agent_name });
          setCreateOpen(true);
        }} title="New Account for Partner">
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300" onClick={(e) => {
          e.stopPropagation();
          setMaturityAccount(row);
        }} title="Change Maturity Date">
          <CalendarClock className="h-3.5 w-3.5" />
        </Button>
      </div>
    )},
  ];

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  return (
    <div className="space-y-6">
      <PendingWalletOperationsWidget />

      {/* ═══ ESCALATION ALERTS ═══ */}
      {openEscalations > 0 && (() => {
        const staleCount = (escalations || []).filter(e => e.escalation_type === 'stale_approval').length;
        const maturityCount = openEscalations - staleCount;
        return (
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="h-4 w-4 text-warning animate-pulse" />
                Active Escalations
                <Badge variant="destructive" className="ml-auto text-[10px]">{openEscalations}</Badge>
              </CardTitle>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {staleCount > 0 && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-destructive border-destructive/30" onClick={() => bulkResolveEscalations('stale_approval')}>
                    <CheckCircle2 className="h-3 w-3" /> Resolve All Stale ({staleCount})
                  </Button>
                )}
                {maturityCount > 0 && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-warning border-warning/30" onClick={() => { bulkResolveEscalations('maturity_30d'); bulkResolveEscalations('maturity_7d'); bulkResolveEscalations('maturity_expired'); }}>
                    <CheckCircle2 className="h-3 w-3" /> Resolve All Maturity ({maturityCount})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 max-h-64 overflow-y-auto">
              {(escalations || []).map(esc => {
                const severity = getEscalationSeverity(esc);
                const hours = (esc.details as any)?.hours_pending;
                const isStale = esc.escalation_type === 'stale_approval';
                const borderColor = severity === 'critical' ? 'border-destructive/50 bg-destructive/5' : severity === 'warning' ? 'border-warning/50 bg-warning/5' : 'border-border/60 bg-card';
                const amount = Number((esc.details as any)?.amount || 0);

                return (
                  <div key={esc.id} className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm ${borderColor}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[9px] ${
                          severity === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                          severity === 'warning' ? 'bg-warning/10 text-warning border-warning/30' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {isStale ? '🚨 Stale' :
                           esc.escalation_type === 'maturity_7d' ? '⚠️ 7d Mat.' :
                           esc.escalation_type === 'maturity_30d' ? '📅 30d Mat.' :
                           '🏁 Matured'}
                        </Badge>
                        <span className="text-xs font-medium truncate">{(esc.details as any)?.portfolio_code || '—'}</span>
                        {amount > 0 && <span className="text-[10px] text-muted-foreground">({amount >= 1e6 ? `${(amount / 1e6).toFixed(1)}M` : `${(amount / 1e3).toFixed(0)}K`})</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {isStale
                          ? `Pending ${hours ? (hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`) : '?'}`
                          : `${(esc.details as any)?.days_remaining || '?'} days remaining`}
                        {' · '}{formatDistanceToNow(new Date(esc.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {isStale && (
                        <Button size="sm" variant="default" className="h-7 text-[10px] gap-1" onClick={() => approvePortfolioFromEscalation(esc)}>
                          ✅ Approve
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => acknowledgeEscalation(esc.id)}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}

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
        <KPICard title="Auto-Reinvest" value={rows.filter(p => p.auto_reinvest).length} icon={RefreshCw} color="bg-cyan-500/10 text-cyan-600" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => { setCreateForUser(null); setCreateOpen(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Portfolio
        </Button>
        <Button variant="outline" onClick={() => { setBulkAction(!bulkAction); setSelectedIds(new Set()); }} className="gap-1.5">
          <CheckCircle2 className="h-4 w-4" /> {bulkAction ? 'Cancel Bulk' : 'Bulk Actions'}
        </Button>

        {bulkAction && selectedIds.size > 0 && (
          <>
            <Badge variant="secondary" className="text-xs">{selectedIds.size} selected</Badge>
            <Button size="sm" variant="outline" onClick={() => handleBulkCurrencyUpdate('USD')} className="h-8 text-xs">Set USD</Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkCurrencyUpdate('UGX')} className="h-8 text-xs">Set UGX</Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkAutoReinvest(true)} className="h-8 text-xs gap-1">
              <RefreshCw className="h-3 w-3" /> Enable Reinvest
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkAutoReinvest(false)} className="h-8 text-xs">Disable Reinvest</Button>
          </>
        )}

        <Badge variant="outline" className="ml-auto gap-1 text-[10px] text-success border-success/30">
          <Zap className="h-3 w-3" /> Auto-payout active
        </Badge>
      </div>

      <ExecutiveDataTable
        data={rows}
        columns={columns}
        loading={isLoading}
        title="Partner Portfolios"
        limit={50}
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
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-sm">ROI Auto-Payout History</h3>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate('/roi-trends')}>
          <TrendingUp className="h-3.5 w-3.5" />
          View Trends & Projection
        </Button>
      </div>
      <ROIPaymentHistory />

      {/* Dialogs */}
      <EditInvestmentAccountDialog open={!!editAccount} onOpenChange={(v) => { if (!v) setEditAccount(null); }} account={editAccount} onSuccess={() => refetch()} />
      <FundInvestmentAccountDialog open={!!fundAccount} onOpenChange={(v) => { if (!v) setFundAccount(null); }} account={fundAccount} onSuccess={() => refetch()} />
      <CreateInvestmentAccountDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={() => refetch()} prefillInvestorId={createForUser?.id} prefillInvestorName={createForUser?.name} />
      <ChangeMaturityDateDialog open={!!maturityAccount} onOpenChange={(v) => { if (!v) setMaturityAccount(null); }} portfolio={maturityAccount} onSuccess={() => refetch()} />
    </div>
  );
}

// ═══ PORTFOLIO HEALTH SCORE ═══
function computeHealth(p: any): number {
  let score = 50; // base

  // Active status
  if (p.status === 'active') score += 20;
  else if (p.status === 'matured') score += 10;
  else if (p.status === 'pending_approval') score -= 10;

  // Has ROI earned
  if (p.total_roi_earned > 0) score += 15;

  // Has maturity date set
  if (p.maturity_date) {
    const days = Math.ceil((new Date(p.maturity_date).getTime() - Date.now()) / (86400000));
    if (days > 30) score += 10;
    else if (days > 0) score += 5;
    else score -= 10; // expired
  }

  // Auto-reinvest enabled (shows engagement)
  if (p.auto_reinvest) score += 5;

  return Math.max(0, Math.min(100, score));
}
