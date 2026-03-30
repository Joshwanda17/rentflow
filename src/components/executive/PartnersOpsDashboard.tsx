import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Banknote, TrendingUp, Calendar, Wallet, PiggyBank, AlertCircle, Pencil, PlusCircle, Plus, RefreshCw, Zap, Bell, CheckCircle2, CalendarClock, Users, DollarSign, AlertTriangle } from 'lucide-react';
import { format, formatDistanceToNow, addMonths } from 'date-fns';

import { ROIPaymentHistory } from './ROIPaymentHistory';
import { PartnerCapitalFlow } from './PartnerCapitalFlow';
import { PartnerOpsBrief } from './PartnerOpsBrief';
import COOPartnersPage from '@/components/coo/COOPartnersPage';
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
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Tab = 'portfolios' | 'escalations' | 'capital' | 'roi';

export function PartnersOpsDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('portfolios');
  const [editAccount, setEditAccount] = useState<any>(null);
  const [fundAccount, setFundAccount] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForUser, setCreateForUser] = useState<{ id: string; name: string } | null>(null);
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
      }));
    },
    staleTime: 600000,
  });

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
  const activePortfolios = rows.filter(p => p.status === 'active').length;
  const openEscalations = (escalations || []).length;

  // Count portfolios nearing payout (within 7 days)
  const nearingPayouts = rows.filter(p => {
    if (p.status !== 'active' || !p.maturity_date) return false;
    const days = Math.ceil((new Date(p.maturity_date).getTime() - Date.now()) / 86400000);
    return days <= 7 && days >= 0;
  }).length;

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
            portfolio_id: p.id, renewed_by: user?.id || 'system',
            reason: 'Auto-renewed on maturity (system)',
            old_maturity_date: p.maturity_date, new_maturity_date: newMaturity,
            old_created_at: p.created_at, new_created_at: new Date().toISOString(),
            old_duration_months: p.duration_months || 12, new_duration_months: p.duration_months || 12,
            old_roi_percentage: p.roi_percentage, new_roi_percentage: p.roi_percentage,
            top_up_amount: 0,
          });
          await supabase.from('partner_escalations')
            .update({ status: 'auto_resolved', resolved_at: new Date().toISOString() })
            .eq('portfolio_id', p.id).eq('status', 'open')
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

  // ═══ ACTIONS ═══
  const acknowledgeEscalation = async (id: string) => {
    await supabase.from('partner_escalations').update({ status: 'acknowledged', resolved_at: new Date().toISOString() }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['partner-escalations'] });
    toast({ title: 'Escalation acknowledged' });
  };

  const approvePortfolioFromEscalation = async (esc: any) => {
    const portfolioId = esc.portfolio_id;
    const { error } = await supabase.from('investor_portfolios').update({ status: 'active' }).eq('id', portfolioId);
    if (error) { toast({ title: 'Approval failed', variant: 'destructive' }); return; }
    await supabase.from('partner_escalations').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', esc.id);
    await supabase.from('partner_escalations').update({ status: 'auto_resolved', resolved_at: new Date().toISOString() }).eq('portfolio_id', portfolioId).eq('escalation_type', 'stale_approval').eq('status', 'open');
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({ user_id: user?.id, action_type: 'portfolio_approved_from_escalation', table_name: 'investor_portfolios', record_id: portfolioId, metadata: { escalation_id: esc.id, portfolio_code: (esc.details as any)?.portfolio_code } });
    queryClient.invalidateQueries({ queryKey: ['partner-escalations'] });
    refetch();
    toast({ title: 'Portfolio approved & escalation resolved' });
  };

  const bulkResolveEscalations = async (type: string) => {
    const toResolve = (escalations || []).filter(e => e.escalation_type === type);
    if (toResolve.length === 0) return;
    const ids = toResolve.map(e => e.id);
    await supabase.from('partner_escalations').update({ status: 'acknowledged', resolved_at: new Date().toISOString() }).in('id', ids);
    queryClient.invalidateQueries({ queryKey: ['partner-escalations'] });
    toast({ title: `${ids.length} ${type.replace('_', ' ')} escalations resolved` });
  };

  const getEscalationSeverity = (esc: any): 'critical' | 'warning' | 'info' => {
    const hours = (esc.details as any)?.hours_pending;
    if (esc.escalation_type === 'stale_approval') {
      if (hours && hours > 168) return 'critical';
      if (hours && hours > 72) return 'warning';
      return 'info';
    }
    const days = (esc.details as any)?.days_remaining;
    if (days && days <= 3) return 'critical';
    if (days && days <= 7) return 'warning';
    return 'info';
  };

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  // ═══ TABS CONFIG ═══
  const tabs: { key: Tab; label: string; icon: any; badge?: number }[] = [
    { key: 'portfolios', label: 'Portfolios', icon: Wallet },
    { key: 'escalations', label: 'Escalations', icon: AlertTriangle, badge: openEscalations || undefined },
    { key: 'capital', label: 'Capital Flow', icon: DollarSign },
    { key: 'roi', label: 'ROI Payouts', icon: TrendingUp },
  ];

  // ═══ ESCALATION PANEL ═══
  const renderEscalations = () => {
    if (openEscalations === 0) {
      return (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
            <p className="text-sm font-medium text-success">No open escalations</p>
            <p className="text-xs text-muted-foreground mt-1">All partner issues are resolved</p>
          </CardContent>
        </Card>
      );
    }

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
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-destructive border-destructive/30" onClick={() => bulkResolveEscalations('stale_approval')}>
                <CheckCircle2 className="h-3 w-3" /> Resolve All Stale ({staleCount})
              </Button>
            )}
            {maturityCount > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-warning border-warning/30" onClick={() => { bulkResolveEscalations('maturity_30d'); bulkResolveEscalations('maturity_7d'); bulkResolveEscalations('maturity_expired'); }}>
                <CheckCircle2 className="h-3 w-3" /> Resolve All Maturity ({maturityCount})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
          {(escalations || []).map(esc => {
            const severity = getEscalationSeverity(esc);
            const hours = (esc.details as any)?.hours_pending;
            const isStale = esc.escalation_type === 'stale_approval';
            const borderColor = severity === 'critical' ? 'border-destructive/50 bg-destructive/5' : severity === 'warning' ? 'border-warning/50 bg-warning/5' : 'border-border/60 bg-card';
            const amount = Number((esc.details as any)?.amount || 0);

            return (
              <div key={esc.id} className={`flex items-center gap-3 rounded-lg border p-2.5 text-sm ${borderColor}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] ${severity === 'critical' ? 'bg-destructive/10 text-destructive border-destructive/30' : severity === 'warning' ? 'bg-warning/10 text-warning border-warning/30' : 'bg-muted text-muted-foreground'}`}>
                      {isStale ? '🚨 Stale' : esc.escalation_type === 'maturity_7d' ? '⚠️ 7d Mat.' : esc.escalation_type === 'maturity_30d' ? '📅 30d Mat.' : '🏁 Matured'}
                    </Badge>
                    <span className="text-xs font-medium truncate">{(esc.details as any)?.portfolio_code || '—'}</span>
                    {amount > 0 && <span className="text-[10px] text-muted-foreground">({amount >= 1e6 ? `${(amount / 1e6).toFixed(1)}M` : `${(amount / 1e3).toFixed(0)}K`})</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {isStale ? `Pending ${hours ? (hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`) : '?'}` : `${(esc.details as any)?.days_remaining || '?'} days remaining`}
                    {' · '}{formatDistanceToNow(new Date(esc.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isStale && (
                    <Button size="sm" variant="default" className="h-7 text-[10px] gap-1" onClick={() => approvePortfolioFromEscalation(esc)}>✅ Approve</Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => acknowledgeEscalation(esc.id)}>Dismiss</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  // ═══ RENDER TAB CONTENT ═══
  const renderTabContent = () => {
    switch (tab) {
      case 'portfolios': return <COOPartnersPage readOnly />;
      case 'escalations': return renderEscalations();
      case 'capital': return <PartnerCapitalFlow />;
      case 'roi': return (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate('/roi-trends')}>
              <TrendingUp className="h-3.5 w-3.5" /> View Trends & Projection
            </Button>
          </div>
          <ROIPaymentHistory />
        </div>
      );
      default: return null;
    }
  };

  // ═══ SUMMARY CARDS ═══
  const summaryCards = [
    { label: 'Total Portfolios', value: rows.length, icon: Shield, accent: 'border-primary/30 bg-primary/5', iconBg: 'bg-primary/10 text-primary' },
    { label: 'Active Portfolios', value: activePortfolios, icon: Wallet, accent: 'border-emerald-500/30 bg-emerald-500/5', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    { label: 'Total Invested', value: fmt(totalInvested), icon: PiggyBank, accent: 'border-amber-500/30 bg-amber-500/5', iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    { label: nearingPayouts > 0 ? 'Nearing Payouts' : 'Avg ROI %', value: nearingPayouts > 0 ? nearingPayouts : (rows.length ? `${(rows.reduce((s, p) => s + (p.roi_percentage || 0), 0) / rows.length).toFixed(1)}%` : '0%'), icon: nearingPayouts > 0 ? CalendarClock : Banknote, accent: nearingPayouts > 0 ? 'border-violet-500/30 bg-violet-500/5' : 'border-purple-500/30 bg-purple-500/5', iconBg: nearingPayouts > 0 ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  ];

  return (
    <div className="space-y-4">
      {/* ═══ A. HEADER BAR ═══ */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Partner Operations</h1>
          <p className="text-xs text-muted-foreground">Manage portfolios, payouts & partner lifecycle</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { refetch(); queryClient.invalidateQueries({ queryKey: ['partner-escalations'] }); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => { setCreateForUser(null); setCreateOpen(true); }}>
            <PlusCircle className="h-3.5 w-3.5" /> Create
          </Button>
        </div>
      </div>

      {/* ═══ B. DAILY BRIEF ═══ */}
      <PartnerOpsBrief />


      {/* ═══ D. TAB BAR ═══ */}
      <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
        <div className="flex items-center gap-1.5 min-w-max">
          {tabs.map(t => {
            const Icon = t.icon;
            const isActive = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.badge && t.badge > 0 && (
                  <span className={cn(
                    'ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold leading-none',
                    isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-destructive/15 text-destructive'
                  )}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ E. ESCALATION BANNER ═══ */}
      {openEscalations > 0 && tab !== 'escalations' && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
          <button
            onClick={() => setTab('escalations')}
            className="w-full flex items-center gap-2.5 rounded-xl border border-warning/40 bg-warning/5 px-3.5 py-2.5 text-left transition-all active:scale-[0.99]"
          >
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <span className="text-xs font-medium flex-1">
              {openEscalations} open escalation{openEscalations !== 1 ? 's' : ''} — tap to review
            </span>
            <span className="text-muted-foreground text-xs">→</span>
          </button>
        </motion.div>
      )}

      {/* ═══ TAB CONTENT ═══ */}
      <div className="min-h-[200px]">
        {renderTabContent()}
      </div>

      {/* Dialogs — always mounted */}
      <EditInvestmentAccountDialog open={!!editAccount} onOpenChange={(v) => { if (!v) setEditAccount(null); }} account={editAccount} onSuccess={() => refetch()} />
      <FundInvestmentAccountDialog open={!!fundAccount} onOpenChange={(v) => { if (!v) setFundAccount(null); }} account={fundAccount} onSuccess={() => refetch()} />
      <CreateInvestmentAccountDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={() => refetch()} prefillInvestorId={createForUser?.id} prefillInvestorName={createForUser?.name} />
      <ChangeMaturityDateDialog open={!!maturityAccount} onOpenChange={(v) => { if (!v) setMaturityAccount(null); }} portfolio={maturityAccount} onSuccess={() => refetch()} />
    </div>
  );
}
