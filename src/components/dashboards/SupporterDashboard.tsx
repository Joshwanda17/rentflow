import { useState, useEffect, useRef } from 'react';
import { useConfetti } from '@/components/Confetti';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useOffline } from '@/contexts/OfflineContext';
import { Button } from '@/components/ui/button';
import { 
  Wallet, TrendingUp, Plus, 
  Receipt, History, Share2, Download, CreditCard,
  Calculator, Store, Users,
  FileText, ScrollText, BarChart3, PieChart, Banknote, HandCoins,
  Menu, ChevronRight
} from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { playSuccessSound, playFirstFundingFanfare } from '@/lib/notificationSound';
import { useToast } from '@/hooks/use-toast';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { SupporterDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';

import { InvestmentAccount } from '@/components/supporter/InvestmentAccountCard';
import { CreateAccountDialog } from '@/components/supporter/CreateAccountDialog';
import { FundAccountDialog } from '@/components/supporter/FundAccountDialog';
import { WithdrawAccountDialog } from '@/components/supporter/WithdrawAccountDialog';
import { AccountDetailsDialog } from '@/components/supporter/AccountDetailsDialog';
import { useWallet } from '@/hooks/useWallet';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import PaymentPartnersDialog from '@/components/payments/PaymentPartnersDialog';

// Modern fintech components
import { HeroBalanceCard } from '@/components/supporter/HeroBalanceCard';
import { OpportunityHeroButton } from '@/components/supporter/OpportunityHeroButton';
import { RentOpportunities } from '@/components/supporter/RentOpportunities';
import { InvestmentCalculator } from '@/components/supporter/InvestmentCalculator';
import { FloatingPortfolioButton } from '@/components/supporter/FloatingPortfolioButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Tenant request details and payment dialogs
import { TenantRequestDetailsDialog } from '@/components/supporter/TenantRequestDetailsDialog';
import { PayLandlordDialog } from '@/components/supporter/PayLandlordDialog';

// Agreement components
import { useSupporterAgreement } from '@/hooks/useSupporterAgreement';
import { 
  SupporterAgreementModal, 
  LockedOverlay,
  AgreementAcceptedBadge
} from '@/components/supporter/agreement';
import { SupporterAgreementViewModal } from '@/components/supporter/agreement/SupporterAgreementCard';

// Menu drawer
import { SupporterMenuDrawer } from '@/components/supporter/SupporterMenuDrawer';
import { hapticTap } from '@/lib/haptics';
import { motion } from 'framer-motion';


interface SupporterDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

interface AvailableRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
  created_at: string;
  tenant_name?: string;
  agent_verified?: boolean;
  manager_verified?: boolean;
}

interface FundedRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
  funded_at: string;
}

export default function SupporterDashboard({ 
  user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent 
}: SupporterDashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useProfile();
  const { isOnline } = useOffline();
  const [availableRequests, setAvailableRequests] = useState<AvailableRequest[]>([]);
  const [fundedRequests, setFundedRequests] = useState<FundedRequest[]>([]);
  const [opportunityCount, setOpportunityCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [hasCachedData, setHasCachedData] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showFundAccount, setShowFundAccount] = useState(false);
  const [showWithdrawAccount, setShowWithdrawAccount] = useState(false);
  const [showAccountDetails, setShowAccountDetails] = useState(false);
  const [selectedAccountForFunding, setSelectedAccountForFunding] = useState<InvestmentAccount | null>(null);
  const [selectedAccountForWithdraw, setSelectedAccountForWithdraw] = useState<InvestmentAccount | null>(null);
  const [selectedAccountForDetails, setSelectedAccountForDetails] = useState<InvestmentAccount | null>(null);
  const [showPaymentPartners, setShowPaymentPartners] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [showViewAgreementModal, setShowViewAgreementModal] = useState(false);
  const [viewAgreementTab, setViewAgreementTab] = useState<'summary' | 'full'>('summary');
  const [localHasAccepted, setLocalHasAccepted] = useState<boolean | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showRequestDetails, setShowRequestDetails] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [showPayLandlord, setShowPayLandlord] = useState(false);
  const [selectedRequestForPayment, setSelectedRequestForPayment] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { toast } = useToast();
  const { wallet, refreshWallet } = useWallet();
  const { fireSuccess, fireFirstFunding } = useConfetti();
  const [hasEverFunded, setHasEverFunded] = useState<boolean | null>(null);
  
  // Agreement status
  const { 
    hasAccepted, 
    acceptance, 
    loading: agreementLoading, 
    acceptAgreement 
  } = useSupporterAgreement();

  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  
  // Ref for refreshing opportunities from parent
  const opportunitiesRefreshRef = useRef<(() => Promise<void>) | null>(null);
  
  // Track local acceptance state
  const effectiveHasAccepted = localHasAccepted === true || hasAccepted === true;
  
  // Show agreement modal on first load if not accepted
  useEffect(() => {
    if (hasAccepted === false && !agreementLoading && localHasAccepted !== true) {
      setShowAgreementModal(true);
    }
  }, [hasAccepted, agreementLoading, localHasAccepted]);

  // Handle agreement acceptance
  const handleAcceptAgreement = async (): Promise<boolean> => {
    const success = await acceptAgreement();
    if (success) {
      setLocalHasAccepted(true);
      setJustAccepted(true);
      setShowAgreementModal(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast({
        title: '🎉 Welcome to Welile Supporters!',
        description: 'Terms accepted. You can now start investing and helping tenants.',
      });
      setTimeout(() => setJustAccepted(false), 5000);
    }
    return success;
  };

  // Load cached data first for offline support
  useEffect(() => {
    const cached = localStorage.getItem(`supporter_dashboard_${user.id}`);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        setAvailableRequests(data.availableRequests || []);
        setFundedRequests(data.fundedRequests || []);
        setAccounts(data.accounts || []);
        setHasCachedData(true);
      } catch (e) {
        console.warn('[SupporterDashboard] Failed to load cached data');
      }
    }
  }, [user.id]);

  // Scroll to opportunities section when hash is present
  useEffect(() => {
    if (location.hash === '#opportunities') {
      setTimeout(() => {
        const el = document.getElementById('opportunities');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [location.hash]);

  useEffect(() => {
    fetchData();
    
    const opportunityChannel = supabase
      .channel('supporter-opportunity-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rent_requests' },
        async () => {
          const { count } = await supabase
            .from('rent_requests')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'approved']);
          setOpportunityCount(count || 0);
        }
      )
      .subscribe();

    // investment_accounts table removed - no realtime subscription needed

    const walletChannel = supabase
      .channel(`supporter-wallet-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `user_id=eq.${user.id}` },
        () => {}
      )
      .subscribe();

    return () => {
      supabase.removeChannel(opportunityChannel);
      supabase.removeChannel(walletChannel);
    };
  }, [user]);

  const fetchData = async () => {
    if (!navigator.onLine && hasCachedData) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    try {
      const [availableRes, fundedRes, accountsRes, opportunityCountRes] = await Promise.all([
        supabase
          .from('rent_requests')
          .select('id, rent_amount, duration_days, status, created_at, agent_verified, manager_verified')
          .eq('status', 'approved')
          .order('created_at', { ascending: true }),
        supabase
          .from('rent_requests')
          .select('id, rent_amount, duration_days, status, funded_at')
          .eq('supporter_id', user.id)
          .order('funded_at', { ascending: false }),
        // investment_accounts table removed - return empty
        { data: [], count: null, error: null, status: 200, statusText: 'OK' } as any,
        supabase
          .from('rent_requests')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'approved'])
      ]);
      
      const newAvailableRequests = availableRes.data || [];
      const newFundedRequests = fundedRes.data || [];
      const newAccounts: InvestmentAccount[] = [];
      const newOpportunityCount = opportunityCountRes.count || 0;
      
      setAvailableRequests(newAvailableRequests);
      setFundedRequests(newFundedRequests);
      setAccounts(newAccounts);
      setOpportunityCount(newOpportunityCount);
      
      if (hasEverFunded === null) {
        setHasEverFunded(newFundedRequests.length > 0);
      }
      
      localStorage.setItem(`supporter_dashboard_${user.id}`, JSON.stringify({
        availableRequests: newAvailableRequests,
        fundedRequests: newFundedRequests,
        accounts: newAccounts,
        timestamp: Date.now()
      }));
      setHasCachedData(true);
    } catch (error) {
      console.error('[SupporterDashboard] Error fetching data:', error);
    }

    setLoading(false);
  };

  const fundRequest = async (requestId: string, rentAmount: number) => {
    const { error } = await supabase
      .from('rent_requests')
      .update({
        supporter_id: user.id,
        status: 'funded',
        funded_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .eq('status', 'approved');

    if (error) {
      toast({ title: 'Funding Failed', description: error.message, variant: 'destructive' });
    } else {
      // platform_transactions table removed - skip logging

      const isFirstFunding = hasEverFunded === false;
      
      if (isFirstFunding) {
        fireFirstFunding();
        playFirstFundingFanfare();
        setHasEverFunded(true);
        toast({
          title: '🎊 Congratulations on Your First Investment!',
          description: `You've funded ${formatUGX(rentAmount)} and started your journey as a Welile Supporter!`
        });
      } else {
        fireSuccess();
        playSuccessSound();
        toast({
          title: '🎉 Request Funded!',
          description: `You've funded ${formatUGX(rentAmount)} for rent facilitation`
        });
      }
      
      fetchData();
    }
  };

  const handleCreateAccount = async (name: string, color: string) => {
    // investment_accounts table removed - feature not active
    toast({ title: 'Investment accounts feature is not currently active', variant: 'destructive' });
  };

  const handleFundAccountClick = (account: InvestmentAccount) => {
    toast({ title: 'Investment accounts feature is not currently active', variant: 'destructive' });
  };

  const handleFundAccount = async (accountId: string, amount: number) => {
    toast({ title: 'Investment accounts feature is not currently active', variant: 'destructive' });
  };

  const handleWithdrawAccountClick = (account: InvestmentAccount) => {
    if (account.status !== 'approved') {
      toast({ title: 'Account Not Approved', description: 'Only approved accounts can withdraw funds', variant: 'destructive' });
      return;
    }
    if (account.balance <= 0) {
      toast({ title: 'No Balance', description: 'This account has no funds to withdraw', variant: 'destructive' });
      return;
    }
    setSelectedAccountForWithdraw(account);
    setShowWithdrawAccount(true);
  };

  const handleWithdrawAccount = async (accountId: string, amount: number) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account || account.balance < amount) {
      toast({ title: 'Insufficient Balance', description: "The account doesn't have enough funds", variant: 'destructive' });
      return;
    }

    // investment_accounts table removed - withdrawals not available
    toast({ title: 'Not Available', description: 'Investment accounts feature is currently disabled.', variant: 'destructive' });
    return;

    await refreshWallet();
    fireSuccess();
    toast({ title: '💰 Withdrawal Submitted!', description: `${formatUGX(amount)} transferred to wallet. Please wait for manager approval before cashing out.` });
  };

  // Calculations
  const totalInvested = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalFunded = fundedRequests.reduce((sum, r) => sum + Number(r.rent_amount), 0);
  const expectedRewards = fundedRequests
    .filter(r => r.status !== 'completed')
    .reduce((sum, r) => sum + calculateSupporterReward(Number(r.rent_amount)), 0);
  const completedRewards = fundedRequests
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + calculateSupporterReward(Number(r.rent_amount)), 0);
  const activeFundings = fundedRequests.filter(r => r.status !== 'completed').length;

  if (loading && isOnline && !hasCachedData) {
    return <SupporterDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await Promise.all([
      fetchData(),
      opportunitiesRefreshRef.current?.()
    ]);
  };

  const handleOpenMenu = () => { hapticTap(); setMenuOpen(true); };

  const menuItems = [
    { icon: CreditCard, label: 'Add Investment', onClick: () => setShowPaymentPartners(true) },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto pb-28 md:pb-4">
        <main className="px-4 py-6 space-y-6 animate-fade-in max-w-lg mx-auto">
          
          {/* ═══════════════════════════════════════════════════════
              PROFILE SECTION - Clean & Minimal like Agent dashboard
          ═══════════════════════════════════════════════════════ */}
          <div className="text-center space-y-3">
            <button onClick={() => navigate('/settings')} className="mx-auto block">
              <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
            </button>
            <div>
              <h1 className="font-bold text-2xl">
                {profile?.full_name || 'Supporter'}
              </h1>
              <p className="text-sm text-muted-foreground">Welile Supporter</p>
            </div>

            {/* Agreement Status - Inline */}
            {effectiveHasAccepted ? (
              <AgreementAcceptedBadge 
                acceptedAt={acceptance?.accepted_at}
                showCelebration={justAccepted}
                variant="compact"
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAgreementModal(true)}
                className="text-xs border-amber-500/50 text-amber-600 hover:bg-amber-500/10 gap-1.5 rounded-xl"
              >
                <FileText className="h-3.5 w-3.5" />
                Accept Terms to Start
              </Button>
            )}
            
            {/* Quick Stats */}
            <div className="flex justify-center gap-6 text-center">
              <div>
                <p className="font-bold text-lg">{activeFundings}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div className="w-px bg-border" />
              <div>
                <p className="font-bold text-lg">{fundedRequests.length}</p>
                <p className="text-xs text-muted-foreground">Funded</p>
              </div>
              <div className="w-px bg-border" />
              <div>
                <p className="font-bold text-lg">{accounts.length}</p>
                <p className="text-xs text-muted-foreground">Accounts</p>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════
              PORTFOLIO CARD - Primary Action
          ═══════════════════════════════════════════════════════ */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/investment-portfolio')}
            className="w-full text-left"
          >
            <HeroBalanceCard
              totalInvested={totalInvested}
              monthlyReturns={totalInvested * 0.15}
              completedRewards={completedRewards}
              activeFundings={activeFundings}
              onAddInvestment={() => setShowPaymentPartners(true)}
              onViewPortfolio={() => navigate('/investment-portfolio')}
            />
          </motion.button>

          {/* ═══════════════════════════════════════════════════════
              OPPORTUNITIES - Second Primary Card
          ═══════════════════════════════════════════════════════ */}
          <div id="opportunities" className="relative scroll-mt-4 space-y-4">
            {!effectiveHasAccepted && <LockedOverlay onAcceptClick={() => setShowAgreementModal(true)} />}
            
            <OpportunityHeroButton onClick={() => navigate('/opportunities')} />

            <RentOpportunities
              onFund={(id) => {
                if (!effectiveHasAccepted) {
                  setShowAgreementModal(true);
                  return;
                }
                setSelectedRequestId(id);
                setShowRequestDetails(true);
              }}
              isLocked={!effectiveHasAccepted}
              onLockedClick={() => setShowAgreementModal(true)}
              onRefreshRef={opportunitiesRefreshRef}
              showCounts={false}
            />
          </div>

          {/* Role switching is now in the header popover */}

          {/* ADD ROLE COMPONENT */}
          <div className="flex justify-center">
            {addRoleComponent}
          </div>

        </main>
      </PullToRefresh>

      {/* ═══════════════════════════════════════════════════════
          FLOATING MENU BUTTON - Like Agent dashboard
      ═══════════════════════════════════════════════════════ */}
      <div className="md:hidden fixed bottom-20 left-4 z-40" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>
        <button
          onClick={handleOpenMenu}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-primary text-primary-foreground shadow-lg active:scale-[0.98] transition-transform touch-manipulation"
        >
          <Menu className="h-5 w-5" />
          <span className="font-semibold text-sm">Menu</span>
        </button>
      </div>

      {/* Menu Drawer */}
      <SupporterMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onAddInvestment={() => setShowPaymentPartners(true)}
        onOpenCalculator={() => setShowCalculator(true)}
        onViewAgreement={() => { setViewAgreementTab('summary'); setShowViewAgreementModal(true); }}
      />

      {/* Dialogs */}
      <CreateAccountDialog
        open={showCreateAccount}
        onOpenChange={setShowCreateAccount}
        onCreateAccount={handleCreateAccount}
      />

      {selectedAccountForFunding && (
        <FundAccountDialog
          open={showFundAccount}
          onOpenChange={setShowFundAccount}
          accountName={selectedAccountForFunding.name}
          accountId={selectedAccountForFunding.id}
          walletBalance={wallet?.balance || 0}
          onFund={handleFundAccount}
        />
      )}

      {selectedAccountForWithdraw && (
        <WithdrawAccountDialog
          open={showWithdrawAccount}
          onOpenChange={setShowWithdrawAccount}
          accountName={selectedAccountForWithdraw.name}
          accountId={selectedAccountForWithdraw.id}
          accountBalance={selectedAccountForWithdraw.balance}
          onWithdraw={handleWithdrawAccount}
        />
      )}

      <AccountDetailsDialog
        open={showAccountDetails}
        onOpenChange={setShowAccountDetails}
        account={selectedAccountForDetails}
        onFund={() => {
          if (selectedAccountForDetails) handleFundAccountClick(selectedAccountForDetails);
        }}
        onWithdraw={() => {
          if (selectedAccountForDetails) handleWithdrawAccountClick(selectedAccountForDetails);
        }}
      />
      
      <PaymentPartnersDialog 
        open={showPaymentPartners} 
        onOpenChange={setShowPaymentPartners}
        dashboardType="supporter"
        title="Add Investment via Mobile Money"
      />
      
      <SupporterAgreementModal
        open={showAgreementModal}
        onOpenChange={setShowAgreementModal}
        onAccept={handleAcceptAgreement}
        loading={agreementLoading}
      />
      
      <SupporterAgreementViewModal
        open={showViewAgreementModal}
        onOpenChange={setShowViewAgreementModal}
        defaultTab={viewAgreementTab}
      />
      
      <Dialog open={showCalculator} onOpenChange={setShowCalculator}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Investment Calculator & ROI Projections
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-0">
            <InvestmentCalculator />
          </div>
        </DialogContent>
      </Dialog>
      
      <TenantRequestDetailsDialog
        open={showRequestDetails}
        onOpenChange={setShowRequestDetails}
        requestId={selectedRequestId}
        onPayLandlord={(request) => {
          setSelectedRequestForPayment(request);
          setShowRequestDetails(false);
          setShowPayLandlord(true);
        }}
      />
      
      <PayLandlordDialog
        open={showPayLandlord}
        onOpenChange={setShowPayLandlord}
        request={selectedRequestForPayment}
        onSuccess={() => {
          fetchData();
          setSelectedRequestForPayment(null);
        }}
      />
      
      <FloatingPortfolioButton totalBalance={totalInvested} />
      <FloatingShareButton />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </div>
  );
}
