import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Banknote, TrendingUp, Calendar, Wallet, PiggyBank, Pencil, PlusCircle, Plus, RefreshCw, CalendarClock, DollarSign, Receipt, ArrowLeft, FileText, UserPlus, UserCog, Inbox, History } from 'lucide-react';
import { format, addMonths } from 'date-fns';

import { ROIPaymentHistory } from './ROIPaymentHistory';
import { PartnerCapitalFlow } from './PartnerCapitalFlow';
import { PartnerOpsBrief } from './PartnerOpsBrief';
import { PartnerOpsReportExportButton } from './PartnerOpsReportExportButton';
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
import { ApprovedPartnerWithdrawals } from '@/components/coo/ApprovedPartnerWithdrawals';
import { PendingPortfolioTopUps } from '@/components/cfo/PendingPortfolioTopUps';
import { PortfolioTopUpVerification } from '@/components/financial-ops/PortfolioTopUpVerification';
import { SelfManagedTopUpReviews } from './SelfManagedTopUpReviews';
import { ShareSupporterRecruit } from '@/components/shared/ShareSupporterRecruit';
import { PartnerFinancialActivity } from './PartnerFinancialActivity';
import { PendingFunderApprovals } from './PendingFunderApprovals';
import { PromissoryNotesQueue } from './PromissoryNotesQueue';
import { PartnerOpsScoreboard } from './PartnerOpsScoreboard';

import { NewPartnersPanel } from './NewPartnersPanel';
import { PendingPartnerRequests } from './PendingPartnerRequests';
import { ProxyAgentManager } from '@/components/cfo/ProxyAgentManager';
import { ProxyAgentApplicationsQueue } from '@/components/executive/ProxyAgentApplicationsQueue';
import { MaturityRequestsQueue } from './MaturityRequestsQueue';
import { InvitedPortfoliosPanel } from './InvitedPortfoliosPanel';
import { PortfolioRenewalsPanel } from './PortfolioRenewalsPanel';
import { SelfManagedNearingPayouts } from './SelfManagedNearingPayouts';

type Tab = 'portfolios' | 'invited' | 'capital' | 'roi' | 'topups' | 'activity' | 'promissory' | 'maturity' | 'renewals' | 'withdrawals' | 'proxy-agents';

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
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, frozen_at').in('id', Array.from(ids));
      const nameMap = new Map<string, string>();
      const frozenIds = new Set<string>();
      (profiles || []).forEach(p => {
        nameMap.set(p.id, p.full_name);
        if (p.frozen_at != null) frozenIds.add(p.id);
      });

      return data.map(p => ({
        ...p,
        owner_frozen: frozenIds.has(p.investor_id || p.agent_id),
        investor_name: p.investor_id ? nameMap.get(p.investor_id) || '—' : '—',
        agent_name: nameMap.get(p.agent_id) || '—',
      }));
    },
    staleTime: 30000,
  });

  const rows = portfolios || [];
  const totalInvested = rows.reduce((s, p) => s + (p.investment_amount || 0), 0);
  const activePortfolios = rows.filter(p => p.status === 'active').length;

  // ═══ INVITED PORTFOLIOS pending count (badge on tab) ═══
  const { data: invitedCount = 0 } = useQuery({
    queryKey: ['invited-portfolios-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('investor_portfolios')
        .select('id', { count: 'exact', head: true })
        .in('status', ['awaiting_partner_details', 'pending_ops_approval']);
      return count || 0;
    },
    staleTime: 15000,
  });

  // Count portfolios nearing payout (within 7 days based on next_roi_date)
  const nearingPayoutsList = rows.filter(p => {
    if (p.status !== 'active') return false;
    if ((p as any).owner_frozen) return false;
    const roiDate = p.next_roi_date;
    if (!roiDate) return false;
    const today = format(new Date(), 'yyyy-MM-dd');
    const sevenDays = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd');
    return roiDate >= today && roiDate <= sevenDays;
  });
  const nearingPayouts = nearingPayoutsList.length;

  // ═══ AUTO-RENEW DUE PORTFOLIOS (server-side, atomic, logged) ═══
  // The database routine picks up matured portfolios, active portfolios past
  // maturity and scheduled renewals whose date has arrived. It is idempotent
  // (one renewal per portfolio per day) so repeated dashboard loads are safe.
  useEffect(() => {
    if (autoRenewedRef.current || !portfolios || portfolios.length === 0) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const due = portfolios.filter(p =>
      p.status === 'matured' ||
      (p.status === 'active' && p.maturity_date && p.maturity_date <= today)
    );
    if (due.length === 0) return;

    autoRenewedRef.current = true;

    const autoRenew = async () => {
      const { data, error } = await supabase.rpc('auto_renew_due_portfolios', { p_limit: 500 });
      if (error) return;
      const res: any = data;
      if ((res?.renewed ?? 0) > 0) {
        toast({
          title: `${res.renewed} portfolio(s) auto-renewed`,
          description: 'Logged in the Renewals tab — reversible from there.',
        });
        queryClient.invalidateQueries({ queryKey: ['portfolio-renewals-log'] });
        refetch();
      }
    };
    autoRenew();
  }, [portfolios]);

  const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : n.toLocaleString();

  // ═══ MATURITY REQUESTS pending badge ═══
  const { data: maturityPending = 0 } = useQuery({
    queryKey: ['maturity-requests-pending-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('portfolio_action_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      return count || 0;
    },
    staleTime: 30000,
  });

  // ═══ TABS CONFIG ═══
  const tabs: { key: Tab; label: string; icon: any; badge?: number }[] = [
    { key: 'portfolios', label: 'Portfolios', icon: Wallet },
    { key: 'invited', label: 'Invited Portfolios', icon: Inbox, badge: invitedCount },
    { key: 'capital', label: 'Capital Flow', icon: DollarSign },
    { key: 'roi', label: 'Returns Payouts', icon: TrendingUp },
    { key: 'topups', label: 'Top-ups', icon: PlusCircle },
    { key: 'promissory', label: 'Promissory Notes', icon: FileText },
    { key: 'maturity', label: 'Maturity Requests', icon: CalendarClock, badge: maturityPending },
    { key: 'renewals', label: 'Renewed Portfolios', icon: History },
    { key: 'withdrawals', label: 'Withdrawals', icon: Banknote },
    { key: 'proxy-agents', label: 'Proxy Agents', icon: UserCog },
  ];

  // ═══ RENDER TAB CONTENT ═══
  const renderTabContent = () => {
    switch (tab) {
      case 'portfolios': return <COOPartnersPage />;
      case 'invited': return <InvitedPortfoliosPanel />;
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
      case 'topups': return (
        <div className="space-y-6">
          <SelfManagedTopUpReviews />
          {/* Actionable queue: wallet→portfolio transfer requests awaiting Partner Ops approval.
              Funds only leave the partner's wallet when approved here. */}
          <PortfolioTopUpVerification />
          <PendingPortfolioTopUps />
        </div>
      );
      case 'activity': return <PartnerFinancialActivity />;
      case 'promissory': return (
        <div className="space-y-6">
          <PartnerOpsScoreboard />
          <PromissoryNotesQueue />
        </div>
      );
      case 'maturity': return <MaturityRequestsQueue />;
      case 'renewals': return <PortfolioRenewalsPanel />;
      case 'withdrawals': return (
        <div className="space-y-6">
          <PartnerOpsWithdrawalQueue />
          <ApprovedPartnerWithdrawals onBack={() => setTab('portfolios')} />
        </div>
      );
      case 'proxy-agents': return (
        <div className="space-y-6">
          <ProxyAgentApplicationsQueue />
          <ProxyAgentManager />
        </div>
      );
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
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => navigate('/partner-onboarding')}
          >
            <UserPlus className="h-3.5 w-3.5" /> Onboarding
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => { setCreateForUser(null); setCreateOpen(true); }}>
            <PlusCircle className="h-3.5 w-3.5" /> Send Portfolio Invite
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

      {/* ═══ C1. PENDING PARTNER ROLE REQUESTS ═══ */}
      <PendingPartnerRequests />

      {/* ═══ C2. NEW PARTNERS SPOTLIGHT + SEARCH ═══ */}
      <NewPartnersPanel />

      {/* ═══ C3. SELF-MANAGED RETURNS DUE (Phase Four visibility) ═══ */}
      <SelfManagedNearingPayouts />

      {/* ═══ D. WITHDRAWAL QUEUE — now inside Withdrawals tab ═══ */}

      {/* ═══ E. DAILY BRIEF ═══ */}
      <div className="flex justify-end">
        <PartnerOpsReportExportButton />
      </div>
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
      <CreateInvestmentAccountDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={() => refetch()} prefillInvestorId={createForUser?.id} prefillInvestorName={createForUser?.name} mode="invite" />
      <ChangeMaturityDateDialog open={!!maturityAccount} onOpenChange={(v) => { if (!v) setMaturityAccount(null); }} portfolio={maturityAccount} onSuccess={() => refetch()} />
    </div>
  );
}
