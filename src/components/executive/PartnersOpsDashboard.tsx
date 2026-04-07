import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Banknote, TrendingUp, Calendar, Wallet, PiggyBank, Pencil, PlusCircle, Plus, RefreshCw, CalendarClock, DollarSign, Receipt, ArrowLeft } from 'lucide-react';
import { format, addMonths } from 'date-fns';

import { ROIPaymentHistory } from './ROIPaymentHistory';
import { PartnerCapitalFlow } from './PartnerCapitalFlow';
import { PartnerOpsBrief } from './PartnerOpsBrief';
import COOPartnersPage from '@/components/coo/COOPartnersPage';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { EditInvestmentAccountDialog } from '@/components/manager/EditInvestmentAccountDialog';
import { FundInvestmentAccountDialog } from '@/components/manager/FundInvestmentAccountDialog';
import { CreateInvestmentAccountDialog } from '@/components/manager/CreateInvestmentAccountDialog';
import { ChangeMaturityDateDialog } from './ChangeMaturityDateDialog';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PartnerOpsWithdrawalQueue } from './PartnerOpsWithdrawalQueue';
import { PendingPortfolioTopUps } from '@/components/cfo/PendingPortfolioTopUps';
import { ShareSupporterRecruit } from '@/components/shared/ShareSupporterRecruit';
import { PartnerFinancialActivity } from './PartnerFinancialActivity';
import { PendingFunderApprovals } from './PendingFunderApprovals';

type Tab = 'portfolios' | 'capital' | 'roi' | 'topups' | 'activity';

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

  // ═══ REALTIME: auto-refresh on portfolio changes ═══
  useEffect(() => {
    const channel = supabase
      .channel('partner-ops-portfolios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investor_portfolios' }, () => {
        queryClient.invalidateQueries({ queryKey: ['exec-partner-portfolios'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: portfolios, isLoading, refetch } = useQuery({
    queryKey: ['exec-partner-portfolios'],
    queryFn: async () => {
      const { data } = await supabase.from('investor_portfolios')
        .select('id, portfolio_code, account_name, investment_amount, roi_percentage, total_roi_earned, status, maturity_date, next_roi_date, created_at, investor_id, agent_id, display_currency, payment_method, mobile_money_number, mobile_network, bank_name, bank_account_name, account_number, payout_day, auto_reinvest, duration_months')
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
    staleTime: 30000,
  });

  const rows = portfolios || [];
  const totalInvested = rows.reduce((s, p) => s + (p.investment_amount || 0), 0);
  const activePortfolios = rows.filter(p => p.status === 'active').length;

  // Count portfolios nearing payout (within 7 days based on next_roi_date)
  const nearingPayoutsList = rows.filter(p => {
    if (p.status !== 'active') return false;
    const roiDate = p.next_roi_date;
    if (!roiDate) return false;
    const today = format(new Date(), 'yyyy-MM-dd');
    const sevenDays = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd');
    return roiDate >= today && roiDate <= sevenDays;
  });
  const nearingPayouts = nearingPayoutsList.length;

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
          renewed++;
        }
      }
      if (renewed > 0) {
        toast({ title: `${renewed} matured portfolio(s) auto-renewed`, description: 'History preserved' });
        refetch();
      }
    };
    autoRenew();
  }, [portfolios]);

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  // ═══ TABS CONFIG ═══
  const tabs: { key: Tab; label: string; icon: any; badge?: number }[] = [
    { key: 'portfolios', label: 'Portfolios', icon: Wallet },
    { key: 'capital', label: 'Capital Flow', icon: DollarSign },
    { key: 'roi', label: 'Returns Payouts', icon: TrendingUp },
    { key: 'topups', label: 'Top-ups', icon: PlusCircle },
  ];

  // ═══ RENDER TAB CONTENT ═══
  const renderTabContent = () => {
    switch (tab) {
      case 'portfolios': return <COOPartnersPage />;
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
      case 'topups': return <PendingPortfolioTopUps />;
      case 'activity': return <PartnerFinancialActivity />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* ═══ A. HEADER BAR ═══ */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Partner Operations</h1>
          <p className="text-xs text-muted-foreground">Manage portfolios, payouts & partner lifecycle</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <ShareSupporterRecruit />
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => { setCreateForUser(null); setCreateOpen(true); }}>
            <PlusCircle className="h-3.5 w-3.5" /> Create
          </Button>
        </div>
      </div>

      {/* ═══ B. FINANCIAL ACTIVITY CARD ═══ */}
      {tab !== 'activity' ? (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
          <Card
            className="border-primary/30 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
            onClick={() => setTab('activity')}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Financial Activity</p>
                <p className="text-xs text-muted-foreground">View all partner payouts, withdrawals, top-ups & retractions</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setTab('portfolios')}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Overview
        </Button>
      )}

      {/* ═══ C. PENDING FUNDER APPROVALS ═══ */}
      <PendingFunderApprovals />

      {/* ═══ D. WITHDRAWAL QUEUE ═══ */}
      <PartnerOpsWithdrawalQueue />

      {/* ═══ E. DAILY BRIEF ═══ */}
      <PartnerOpsBrief onNavigate={(t) => setTab(t as Tab)} />


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
