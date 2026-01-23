import { useState, useEffect, useRef } from 'react';
import { useConfetti } from '@/components/Confetti';
import { useNavigate, useLocation } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useOffline } from '@/contexts/OfflineContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Wallet, TrendingUp, Plus, 
  Receipt, History, Share2, Download, CreditCard,
  Calculator, Store, Users,
  FileText, ScrollText, BarChart3, PieChart, Banknote, HandCoins
} from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { playSuccessSound, playFirstFundingFanfare } from '@/lib/notificationSound';
import { useToast } from '@/hooks/use-toast';
import RoleSwitcher from '@/components/RoleSwitcher';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import { CollapsibleWalletCard } from '@/components/wallet/CollapsibleWalletCard';
import { motion, AnimatePresence } from 'framer-motion';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { SupporterDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';

import { InvestmentAccount } from '@/components/supporter/InvestmentAccountCard';
import { CreateAccountDialog } from '@/components/supporter/CreateAccountDialog';
import { FundAccountDialog } from '@/components/supporter/FundAccountDialog';
import { WithdrawAccountDialog } from '@/components/supporter/WithdrawAccountDialog';
import { AccountDetailsDialog } from '@/components/supporter/AccountDetailsDialog';
import { ShareSupporterLink } from '@/components/supporter/ShareSupporterLink';
import { useWallet } from '@/hooks/useWallet';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import MobileQuickMenu from '@/components/MobileQuickMenu';
import PaymentPartnersDialog from '@/components/payments/PaymentPartnersDialog';

// Modern fintech components
import { HeroBalanceCard } from '@/components/supporter/HeroBalanceCard';
import { ModernQuickActions } from '@/components/supporter/ModernQuickActions';
import { ModernSectionHeader } from '@/components/supporter/ModernSectionHeader';
import { ModernInviteCard } from '@/components/supporter/ModernInviteCard';
import { ModernQuickLinks } from '@/components/supporter/ModernQuickLinks';

import { RentOpportunities } from '@/components/supporter/RentOpportunities';
import { CollapsibleQuickNav } from '@/components/CollapsibleQuickNav';
import { InvestmentCalculator } from '@/components/supporter/InvestmentCalculator';
import { ROIEarningsCard } from '@/components/supporter/ROIEarningsCard';
import { MyInvestmentRequests } from '@/components/supporter/MyInvestmentRequests';
import { FloatingPortfolioButton } from '@/components/supporter/FloatingPortfolioButton';
import { FundedHistory } from '@/components/supporter/FundedHistory';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Tenant request details and payment dialogs
import { TenantRequestDetailsDialog } from '@/components/supporter/TenantRequestDetailsDialog';
import { PayLandlordDialog } from '@/components/supporter/PayLandlordDialog';

// Agreement components
import { useSupporterAgreement } from '@/hooks/useSupporterAgreement';
import { 
  SupporterAgreementModal, 
  LockedOverlay 
} from '@/components/supporter/agreement';
import { SupporterAgreementViewModal } from '@/components/supporter/agreement/SupporterAgreementCard';

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
  const [showCalculator, setShowCalculator] = useState(false);
  const [showRequestDetails, setShowRequestDetails] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [showPayLandlord, setShowPayLandlord] = useState(false);
  const [selectedRequestForPayment, setSelectedRequestForPayment] = useState<any>(null);
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
  
  // Track local acceptance state - once accepted, never show agreement UI again in this session
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
      setShowAgreementModal(false);
      // Scroll to top and show welcome message
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast({
        title: '🎉 Welcome to Welile Supporters!',
        description: 'Terms accepted. You can now start investing and helping tenants.',
      });
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
      // Small delay to ensure content is rendered
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
    
    // Real-time subscription for opportunity count updates
    const channel = supabase
      .channel('supporter-opportunity-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rent_requests',
        },
        async (payload) => {
          // Refresh opportunity count when rent_requests change
          const { count } = await supabase
            .from('rent_requests')
            .select('id', { count: 'exact', head: true })
            .in('status', ['pending', 'approved']);
          
          setOpportunityCount(count || 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    // Skip network fetch if offline and we have cached data
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
        supabase
          .from('investment_accounts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
        // Count all unfunded opportunities (pending + approved)
        supabase
          .from('rent_requests')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'approved'])
      ]);
      
      const newAvailableRequests = availableRes.data || [];
      const newFundedRequests = fundedRes.data || [];
      const newAccounts = (accountsRes.data || []).map(acc => ({
        id: acc.id,
        name: acc.name,
        balance: Number(acc.balance),
        invested: 0,
        returns: 0,
        color: acc.color,
        status: acc.status as 'pending' | 'approved' | 'rejected',
      }));
      const newOpportunityCount = opportunityCountRes.count || 0;
      
      setAvailableRequests(newAvailableRequests);
      setFundedRequests(newFundedRequests);
      setAccounts(newAccounts);
      setOpportunityCount(newOpportunityCount);
      
      // Track if user has ever funded (for first-time celebration)
      if (hasEverFunded === null) {
        setHasEverFunded(newFundedRequests.length > 0);
      }
      
      // Cache the data for offline use
      localStorage.setItem(`supporter_dashboard_${user.id}`, JSON.stringify({
        availableRequests: newAvailableRequests,
        fundedRequests: newFundedRequests,
        accounts: newAccounts,
        timestamp: Date.now()
      }));
      setHasCachedData(true);
    } catch (error) {
      console.error('[SupporterDashboard] Error fetching data:', error);
      // If we have cached data, don't show error, just use cached
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
      toast({
        title: 'Funding Failed',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      await supabase.from('platform_transactions').insert({
        rent_request_id: requestId,
        user_id: user.id,
        transaction_type: 'supporter_funding',
        amount: rentAmount,
        direction: 'out',
        description: 'Rent facilitation funding'
      });

      // Check if this is their first funding
      const isFirstFunding = hasEverFunded === false;
      
      if (isFirstFunding) {
        // Extra special celebration for first-time funders!
        fireFirstFunding();
        playFirstFundingFanfare(); // Special fanfare for first-time funders
        setHasEverFunded(true);
        toast({
          title: '🎊 Congratulations on Your First Investment!',
          description: `You've funded ${formatUGX(rentAmount)} and started your journey as a Welile Supporter!`
        });
      } else {
        fireSuccess();
        playSuccessSound(); // Play celebratory sound with confetti
        toast({
          title: '🎉 Request Funded!',
          description: `You've funded ${formatUGX(rentAmount)} for rent facilitation`
        });
      }
      
      fetchData();
    }
  };

  const handleCreateAccount = async (name: string, color: string) => {
    const { data, error } = await supabase
      .from('investment_accounts')
      .insert({
        user_id: user.id,
        name,
        color,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      toast({ 
        title: 'Error', 
        description: error.message,
        variant: 'destructive' 
      });
      return;
    }

    if (data) {
      const newAccount: InvestmentAccount = {
        id: data.id,
        name: data.name,
        balance: Number(data.balance),
        invested: 0,
        returns: 0,
        color: data.color,
        status: 'pending',
      };
      setAccounts(prev => [...prev, newAccount]);
      toast({ 
        title: '🎉 Account Created!', 
        description: `${name} is pending manager approval` 
      });
    }
  };

  const handleFundAccountClick = (account: InvestmentAccount) => {
    if (account.status !== 'approved') {
      toast({ 
        title: 'Account Not Approved', 
        description: 'Only approved accounts can receive funds',
        variant: 'destructive' 
      });
      return;
    }
    setSelectedAccountForFunding(account);
    setShowFundAccount(true);
  };

  const handleFundAccount = async (accountId: string, amount: number) => {
    if (!wallet || wallet.balance < amount) {
      toast({ 
        title: 'Insufficient Balance', 
        description: 'You don\'t have enough funds in your wallet',
        variant: 'destructive' 
      });
      return;
    }

    const { error: walletError } = await supabase
      .from('wallets')
      .update({ balance: wallet.balance - amount })
      .eq('user_id', user.id);

    if (walletError) {
      toast({ title: 'Error', description: walletError.message, variant: 'destructive' });
      return;
    }

    const { data: currentAccount } = await supabase
      .from('investment_accounts')
      .select('balance, name')
      .eq('id', accountId)
      .single();

    if (currentAccount) {
      await supabase
        .from('investment_accounts')
        .update({ balance: Number(currentAccount.balance) + amount })
        .eq('id', accountId);

      // Notify all managers about the funding for approval
      const { data: managers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'manager')
        .eq('enabled', true);

      if (managers && managers.length > 0) {
        const notifications = managers.map((manager) => ({
          user_id: manager.user_id,
          title: '💰 Investment Account Funded!',
          message: `${profile?.full_name || 'A supporter'} funded ${formatUGX(amount)} to "${currentAccount.name}". Review and approve.`,
          type: 'investment_funding',
          metadata: { 
            account_id: accountId, 
            supporter_id: user.id,
            supporter_name: profile?.full_name,
            amount: amount,
            account_name: currentAccount.name
          }
        }));

        await supabase.from('notifications').insert(notifications);
      }
    }

    setAccounts(prev => prev.map(acc => 
      acc.id === accountId 
        ? { ...acc, balance: acc.balance + amount, invested: acc.invested + amount }
        : acc
    ));

    await refreshWallet();
    fireSuccess();

    toast({ 
      title: '🎉 Account Funded!', 
      description: `${formatUGX(amount)} has been added to your investment account` 
    });
  };

  const handleWithdrawAccountClick = (account: InvestmentAccount) => {
    if (account.status !== 'approved') {
      toast({ 
        title: 'Account Not Approved', 
        description: 'Only approved accounts can withdraw funds',
        variant: 'destructive' 
      });
      return;
    }
    if (account.balance <= 0) {
      toast({ 
        title: 'No Balance', 
        description: 'This account has no funds to withdraw',
        variant: 'destructive' 
      });
      return;
    }
    setSelectedAccountForWithdraw(account);
    setShowWithdrawAccount(true);
  };

  const handleWithdrawAccount = async (accountId: string, amount: number) => {
    const account = accounts.find(a => a.id === accountId);
    if (!account || account.balance < amount) {
      toast({ 
        title: 'Insufficient Balance', 
        description: 'The account doesn\'t have enough funds',
        variant: 'destructive' 
      });
      return;
    }

    const { data: currentWallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    const currentWalletBalance = currentWallet?.balance || 0;

    const { error: walletError } = await supabase
      .from('wallets')
      .update({ balance: currentWalletBalance + amount })
      .eq('user_id', user.id);

    if (walletError) {
      toast({ title: 'Error', description: walletError.message, variant: 'destructive' });
      return;
    }

    await supabase
      .from('investment_accounts')
      .update({ balance: account.balance - amount })
      .eq('id', accountId);

    setAccounts(prev => prev.map(acc => 
      acc.id === accountId 
        ? { ...acc, balance: acc.balance - amount }
        : acc
    ));

    await refreshWallet();
    fireSuccess();

    toast({ 
      title: '💰 Withdrawal Complete!', 
      description: `${formatUGX(amount)} has been transferred to your wallet` 
    });
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

  // Only show skeleton if loading AND online AND no cached data
  if (loading && isOnline && !hasCachedData) {
    return <SupporterDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await Promise.all([
      fetchData(),
      opportunitiesRefreshRef.current?.()
    ]);
  };

  const menuItems = [
    { icon: CreditCard, label: 'Add Investment', onClick: () => setShowPaymentPartners(true) },
    { icon: Calculator, label: 'Calculator', onClick: () => navigate('/calculator') },
    { icon: Wallet, label: 'My Wallet', onClick: () => document.getElementById('wallet-section')?.scrollIntoView({ behavior: 'smooth' }) },
    { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts'), separator: true },
    { icon: History, label: 'Transactions', onClick: () => navigate('/transactions') },
    { icon: Share2, label: 'Referrals', onClick: () => navigate('/referrals') },
    { icon: Download, label: 'Share App', onClick: () => navigate('/install') },
  ];

  // Active tab state for opportunities section
  const [activeOpportunityTab, setActiveOpportunityTab] = useState<'opportunities' | 'funded'>('opportunities');

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-background pb-24 sm:pb-20 md:pb-0">
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
        opportunityCount={opportunityCount}
        onOpportunityBadgeClick={() => navigate('/opportunities')}
      />

      <main className="container mx-auto px-4 py-5 space-y-5 max-w-lg">
        
        {/* Role Switcher - Prominent placement for multi-role users */}
        {availableRoles.length > 1 && (
          <RoleSwitcher
            currentRole={currentRole}
            availableRoles={availableRoles}
            onRoleChange={onRoleChange}
            variant="prominent"
          />
        )}

        {/* Greeting - Minimal & Clean */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between"
        >
          <div>
            <p className="text-sm text-muted-foreground">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}</p>
            <h1 className="text-xl font-bold text-foreground">
              {profile?.full_name?.split(' ')[0] || 'Investor'} 👋
            </h1>
          </div>
          {!effectiveHasAccepted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAgreementModal(true)}
              className="text-xs border-amber-500/50 text-amber-600 hover:bg-amber-500/10 gap-1.5 rounded-xl"
            >
              <FileText className="h-3.5 w-3.5" />
              Accept Terms
            </Button>
          )}
        </motion.div>

        {/* Hero Balance Card - Y Combinator Fintech Style */}
        <HeroBalanceCard
          totalInvested={totalInvested}
          monthlyReturns={totalInvested * 0.15}
          completedRewards={completedRewards}
          activeFundings={activeFundings}
          onAddInvestment={() => setShowPaymentPartners(true)}
          onViewPortfolio={() => navigate('/investment-portfolio')}
        />

        {/* Quick Actions - Uber/PayPal style grid */}
        <ModernQuickActions
          actions={[
            { icon: Plus, label: 'Invest', onClick: () => setShowPaymentPartners(true), variant: 'primary' },
            { icon: Users, label: 'Fund', onClick: () => navigate('/opportunities'), variant: 'success', badge: opportunityCount > 0 ? String(opportunityCount) : undefined },
            { icon: PieChart, label: 'Portfolio', onClick: () => navigate('/investment-portfolio') },
            { icon: Calculator, label: 'Calculator', onClick: () => setShowCalculator(true) },
          ]}
        />

        {/* ROI Earnings - Compact */}
        <ROIEarningsCard />

        {/* My Investment Requests */}
        <MyInvestmentRequests />

        {/* Opportunities Section - Modern Tabs */}
        <div id="opportunities" className="relative scroll-mt-4">
          {!effectiveHasAccepted && <LockedOverlay onAcceptClick={() => setShowAgreementModal(true)} />}
          
          {/* Custom Modern Tabs */}
          <div className="bg-muted/40 p-1.5 rounded-2xl mb-4">
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => {
                  setActiveOpportunityTab('opportunities');
                  navigate('/opportunities');
                }}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-300 touch-manipulation ${
                  activeOpportunityTab === 'opportunities'
                    ? 'bg-primary text-white shadow-lg'
                    : 'text-muted-foreground hover:bg-muted/60'
                }`}
              >
                <TrendingUp className="h-4 w-4" />
                <span>Opportunities</span>
                {opportunityCount > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                    activeOpportunityTab === 'opportunities'
                      ? 'bg-white/25'
                      : 'bg-primary/15 text-primary'
                  }`}>
                    {opportunityCount > 99 ? '99+' : opportunityCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveOpportunityTab('funded')}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all duration-300 touch-manipulation ${
                  activeOpportunityTab === 'funded'
                    ? 'bg-emerald-500 text-white shadow-lg'
                    : 'text-muted-foreground hover:bg-muted/60'
                }`}
              >
                <HandCoins className="h-4 w-4" />
                <span>Funded</span>
                {fundedRequests.length > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                    activeOpportunityTab === 'funded'
                      ? 'bg-white/25'
                      : 'bg-emerald-500/15 text-emerald-600'
                  }`}>
                    {fundedRequests.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {activeOpportunityTab === 'opportunities' ? (
              <motion.div
                key="opportunities"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
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
                />
              </motion.div>
            ) : (
              <motion.div
                key="funded"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <FundedHistory />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Wallet - Collapsible */}
        <div id="wallet-section">
          <CollapsibleWalletCard />
        </div>

        {/* Invite Friends - Modern gradient card */}
        <ModernInviteCard onShare={() => {}} />

        {/* Quick Links - Amazon/Uber style */}
        <ModernQuickLinks
          links={[
            { icon: History, label: 'Transaction History', sublabel: 'View all activity', onClick: () => navigate('/transactions') },
            { icon: BarChart3, label: 'ROI Analytics', sublabel: 'Earnings & projections', onClick: () => navigate('/supporter-earnings'), variant: 'success' },
            { icon: Receipt, label: 'My Receipts', sublabel: 'Payment records', onClick: () => navigate('/my-receipts') },
            { icon: Share2, label: 'Referrals', sublabel: 'Invite & earn', onClick: () => navigate('/referrals'), variant: 'primary' },
            { icon: Store, label: 'Marketplace', sublabel: 'Shop products', onClick: () => navigate('/marketplace') },
          ]}
        />

        {/* Terms Footer - Subtle access */}
        {effectiveHasAccepted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-4 pt-2 pb-4"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setViewAgreementTab('summary'); setShowViewAgreementModal(true); }}
              className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <ScrollText className="h-3.5 w-3.5" />
              Terms Summary
            </Button>
            <span className="text-muted-foreground/30">|</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setViewAgreementTab('full'); setShowViewAgreementModal(true); }}
              className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Full Agreement
            </Button>
          </motion.div>
        )}
      </main>

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
          if (selectedAccountForDetails) {
            handleFundAccountClick(selectedAccountForDetails);
          }
        }}
        onWithdraw={() => {
          if (selectedAccountForDetails) {
            handleWithdrawAccountClick(selectedAccountForDetails);
          }
        }}
      />
      
      <PaymentPartnersDialog 
        open={showPaymentPartners} 
        onOpenChange={setShowPaymentPartners}
        dashboardType="supporter"
        title="Add Investment via Mobile Money"
      />
      
      {/* Agreement Modal */}
      <SupporterAgreementModal
        open={showAgreementModal}
        onOpenChange={setShowAgreementModal}
        onAccept={handleAcceptAgreement}
        loading={agreementLoading}
      />
      
      {/* Agreement View Modal (for viewing after acceptance) */}
      <SupporterAgreementViewModal
        open={showViewAgreementModal}
        onOpenChange={setShowViewAgreementModal}
        defaultTab={viewAgreementTab}
      />
      
      {/* Investment Calculator Dialog */}
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
      
      {/* Tenant Request Details Dialog */}
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
      
      {/* Pay Landlord Dialog */}
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
      <MobileQuickMenu currentRole={currentRole} />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
