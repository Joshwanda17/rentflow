import { useState, useEffect } from 'react';
import { useConfetti } from '@/components/Confetti';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  LogOut, Wallet, TrendingUp, Settings, Plus, 
  Receipt, History, Share2, Download, CreditCard,
  Calculator, Target, ChevronRight, Sparkles, Store, Users,
  FileText, ScrollText, BarChart3
} from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import RoleSwitcher from '@/components/RoleSwitcher';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import { WalletCard } from '@/components/wallet/WalletCard';
import { motion } from 'framer-motion';
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

// Simple components
import { SimpleInvestmentCard } from '@/components/supporter/SimpleInvestmentCard';
import { QuickStatsRow } from '@/components/supporter/QuickStatsRow';
import { SimpleTenantsList } from '@/components/supporter/SimpleTenantsList';
import { SimpleAccountsList } from '@/components/supporter/SimpleAccountsList';
import { CollapsibleQuickNav } from '@/components/CollapsibleQuickNav';
import { InvestmentCalculator } from '@/components/supporter/InvestmentCalculator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Agreement components
import { useSupporterAgreement } from '@/hooks/useSupporterAgreement';
import { 
  SupporterAgreementBanner, 
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
  const { profile } = useProfile();
  const [availableRequests, setAvailableRequests] = useState<AvailableRequest[]>([]);
  const [fundedRequests, setFundedRequests] = useState<FundedRequest[]>([]);
  const [loading, setLoading] = useState(true);
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
  const { toast } = useToast();
  const { wallet, refreshWallet } = useWallet();
  const { fireSuccess } = useConfetti();
  
  // Agreement status
  const { 
    hasAccepted, 
    acceptance, 
    loading: agreementLoading, 
    acceptAgreement 
  } = useSupporterAgreement();

  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  
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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [availableRes, fundedRes, accountsRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id, rent_amount, duration_days, status, created_at')
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
        .order('created_at', { ascending: true })
    ]);
    
    setAvailableRequests(availableRes.data || []);
    setFundedRequests(fundedRes.data || []);

    const dbAccounts = (accountsRes.data || []).map(acc => ({
      id: acc.id,
      name: acc.name,
      balance: Number(acc.balance),
      invested: 0,
      returns: 0,
      color: acc.color,
      status: acc.status as 'pending' | 'approved' | 'rejected',
    }));
    setAccounts(dbAccounts);

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

      fireSuccess();

      toast({
        title: '🎉 Request Funded!',
        description: `You've funded ${formatUGX(rentAmount)} for rent facilitation`
      });
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
      .select('balance')
      .eq('id', accountId)
      .single();

    if (currentAccount) {
      await supabase
        .from('investment_accounts')
        .update({ balance: Number(currentAccount.balance) + amount })
        .eq('id', accountId);
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

  if (loading) {
    return <SupporterDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await fetchData();
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

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 pb-24 sm:pb-20 md:pb-0">
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
        
        {/* Role Switcher - Prominent placement for multi-role users */}
        {availableRoles.length > 1 && (
          <RoleSwitcher
            currentRole={currentRole}
            availableRoles={availableRoles}
            onRoleChange={onRoleChange}
            variant="prominent"
          />
        )}

        {/* Welcome Message */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-2"
        >
          <h1 className="text-xl font-black text-foreground">
            Welcome, {profile?.full_name?.split(' ')[0] || 'Supporter'} 👋
          </h1>
          <p className="text-sm text-muted-foreground">Earn 15% monthly by helping tenants</p>
          
          {/* Easy Agreement Access */}
          {effectiveHasAccepted ? (
            <div className="flex items-center justify-center gap-3 mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setViewAgreementTab('summary'); setShowViewAgreementModal(true); }}
                className="text-xs text-muted-foreground hover:text-primary gap-1.5"
              >
                <ScrollText className="h-3.5 w-3.5" />
                Summary
              </Button>
              <span className="text-muted-foreground/50">•</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setViewAgreementTab('full'); setShowViewAgreementModal(true); }}
                className="text-xs text-muted-foreground hover:text-primary gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                Full Agreement
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAgreementModal(true)}
              className="mt-2 text-xs border-warning text-warning hover:bg-warning/10 gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Accept Terms to Continue
            </Button>
          )}
        </motion.div>

        {/* Quick Stats */}
        <QuickStatsRow 
          stats={[
            { emoji: '💰', label: 'Invested', value: formatUGX(totalInvested) },
            { emoji: '📈', label: 'Earnings', value: formatUGX(completedRewards), color: 'text-success' },
            { emoji: '🏠', label: 'Funded', value: `${activeFundings}` },
          ]}
        />

        {/* Collapsible Quick Navigation */}
        <CollapsibleQuickNav
          buttonLabel="Quick Actions"
          items={[
            { icon: CreditCard, label: 'Add Investment', onClick: () => setShowPaymentPartners(true), variant: 'primary' },
            { icon: Users, label: 'Help Tenants', onClick: () => document.getElementById('tenants-section')?.scrollIntoView({ behavior: 'smooth' }), variant: 'success' },
            { icon: Calculator, label: 'ROI Calculator', onClick: () => setShowCalculator(true) },
            { icon: BarChart3, label: 'Projections', onClick: () => setShowCalculator(true) },
            { icon: Wallet, label: 'My Wallet', onClick: () => document.getElementById('wallet-section')?.scrollIntoView({ behavior: 'smooth' }) },
            { icon: Target, label: 'Accounts', onClick: () => document.getElementById('accounts-section')?.scrollIntoView({ behavior: 'smooth' }) },
            { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts') },
            { icon: History, label: 'Transactions', onClick: () => navigate('/transactions') },
            { icon: Share2, label: 'Referrals', onClick: () => navigate('/referrals') },
            { icon: Store, label: 'Marketplace', onClick: () => navigate('/marketplace') },
            // Agreement action - show "Accept" if not accepted, otherwise view options
            ...(!effectiveHasAccepted ? [
              { icon: FileText, label: 'Accept Terms', onClick: () => setShowAgreementModal(true), variant: 'warning' as const },
            ] : [
              { icon: ScrollText, label: 'Quick Terms', onClick: () => { setViewAgreementTab('summary'); setShowViewAgreementModal(true); } },
              { icon: FileText, label: 'Full Agreement', onClick: () => { setViewAgreementTab('full'); setShowViewAgreementModal(true); } },
            ]),
          ]}
        />

        {/* Main Investment Card */}
        <SimpleInvestmentCard
          totalInvested={totalInvested}
          expectedReturns={expectedRewards}
          onAddInvestment={() => setShowPaymentPartners(true)}
          onViewDetails={() => document.getElementById('accounts-section')?.scrollIntoView({ behavior: 'smooth' })}
        />

        {/* Tenants Needing Help */}
        <div id="tenants-section" className="relative">
          {!effectiveHasAccepted && <LockedOverlay onAcceptClick={() => setShowAgreementModal(true)} />}
          <SimpleTenantsList
            requests={availableRequests}
            onFund={effectiveHasAccepted ? fundRequest : () => setShowAgreementModal(true)}
            loading={loading}
          />
        </div>

        {/* My Accounts */}
        <div id="accounts-section">
          <SimpleAccountsList
            accounts={accounts}
            onCreateAccount={() => setShowCreateAccount(true)}
            onFundAccount={handleFundAccountClick}
            onWithdrawAccount={handleWithdrawAccountClick}
            onViewDetails={(account) => {
              setSelectedAccountForDetails(account);
              setShowAccountDetails(true);
            }}
          />
        </div>

        {/* Wallet */}
        <div id="wallet-section">
          <WalletCard />
        </div>

        {/* Invite Friends Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-0 bg-gradient-to-r from-primary/10 to-success/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/20">
                    <Share2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground">Invite Friends</p>
                    <p className="text-xs text-muted-foreground">Earn rewards together</p>
                  </div>
                </div>
                <ShareSupporterLink variant="default" className="bg-primary hover:bg-primary/90" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={() => navigate('/transactions')}
            className="h-14 justify-start gap-3 border-border/50"
          >
            <History className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold">History</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/referrals')}
            className="h-14 justify-start gap-3 border-border/50"
          >
            <Share2 className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold">Referrals</span>
          </Button>
        </div>
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
      
      <FloatingShareButton />
      <MobileQuickMenu currentRole={currentRole} />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
