import { useState, useEffect } from 'react';
import { useConfetti } from '@/components/Confetti';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  LogOut, Wallet, TrendingUp, Settings, Plus, 
  Menu, Receipt, History, Share2, Users, Coins,
  BarChart3, FileText, Sparkles, ArrowUpRight, Zap, Target
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
import { UserAvatar } from '@/components/UserAvatar';
import { SupporterDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';

import { InvestmentCalculator } from '@/components/supporter/InvestmentCalculator';
import { InvestmentAccountCard, InvestmentAccount } from '@/components/supporter/InvestmentAccountCard';
import { CreateAccountDialog } from '@/components/supporter/CreateAccountDialog';
import { FundAccountDialog } from '@/components/supporter/FundAccountDialog';
import { WithdrawAccountDialog } from '@/components/supporter/WithdrawAccountDialog';
import { TenantsNeedingRent } from '@/components/supporter/TenantsNeedingRent';
import { InvestmentGoals, InvestmentGoal } from '@/components/supporter/InvestmentGoals';
import { InterestPaymentHistory } from '@/components/supporter/InterestPaymentHistory';
import { AccountDetailsDialog } from '@/components/supporter/AccountDetailsDialog';
import { ShareSupporterLink } from '@/components/supporter/ShareSupporterLink';
import { SupporterReferralStats } from '@/components/supporter/SupporterReferralStats';
import { SupporterLeaderboard } from '@/components/supporter/SupporterLeaderboard';
import { useWallet } from '@/hooks/useWallet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const { toast } = useToast();
  const { wallet, refreshWallet } = useWallet();

  // Investment accounts (stored in database)
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);

  // Investment goals (stored in localStorage)
  const [goals, setGoals] = useState<InvestmentGoal[]>(() => {
    const saved = localStorage.getItem(`supporter_goals_${user.id}`);
    if (saved) return JSON.parse(saved);
    return [];
  });

  useEffect(() => {
    localStorage.setItem(`supporter_goals_${user.id}`, JSON.stringify(goals));
  }, [goals, user.id]);

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

    // Map database accounts to InvestmentAccount format
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

  const { fireSuccess } = useConfetti();

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

      // Trigger confetti celebration! 🎉
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

  const handleDeleteAccount = async (id: string) => {
    const { error } = await supabase
      .from('investment_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'pending');

    if (error) {
      toast({ 
        title: 'Error', 
        description: 'Cannot delete approved accounts',
        variant: 'destructive' 
      });
      return;
    }

    setAccounts(prev => prev.filter(acc => acc.id !== id));
    toast({ title: 'Account Deleted' });
  };

  // Goal handlers
  const handleAddGoal = (goal: Omit<InvestmentGoal, 'id' | 'currentAmount' | 'createdAt'>) => {
    const newGoal: InvestmentGoal = {
      ...goal,
      id: crypto.randomUUID(),
      currentAmount: expectedRewards,
      createdAt: new Date().toISOString(),
    };
    setGoals(prev => [...prev, newGoal]);
    toast({ title: 'Goal Created', description: `"${goal.name}" has been set` });
  };

  const handleUpdateGoal = (id: string, updates: Partial<InvestmentGoal>) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    toast({ title: 'Goal Updated' });
  };

  const handleDeleteGoal = (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    toast({ title: 'Goal Deleted' });
  };

  // Fund account handler
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

    // Deduct from wallet
    const { error: walletError } = await supabase
      .from('wallets')
      .update({ balance: wallet.balance - amount })
      .eq('user_id', user.id);

    if (walletError) {
      toast({ title: 'Error', description: walletError.message, variant: 'destructive' });
      return;
    }

    // Add to investment account
    const { error: accountError } = await supabase
      .from('investment_accounts')
      .update({ balance: supabase.rpc ? amount : amount }) // Will use current + amount
      .eq('id', accountId);

    // Actually we need to get current balance first
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

    // Update local state
    setAccounts(prev => prev.map(acc => 
      acc.id === accountId 
        ? { ...acc, balance: acc.balance + amount, invested: acc.invested + amount }
        : acc
    ));

    // Refresh wallet
    await refreshWallet();

    // Fire confetti!
    fireSuccess();

    toast({ 
      title: '🎉 Account Funded!', 
      description: `${formatUGX(amount)} has been added to your investment account` 
    });
  };

  // Withdraw account handler
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

    // Get current wallet balance
    const { data: currentWallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    const currentWalletBalance = currentWallet?.balance || 0;

    // Add to wallet
    const { error: walletError } = await supabase
      .from('wallets')
      .update({ balance: currentWalletBalance + amount })
      .eq('user_id', user.id);

    if (walletError) {
      toast({ title: 'Error', description: walletError.message, variant: 'destructive' });
      return;
    }

    // Deduct from investment account
    await supabase
      .from('investment_accounts')
      .update({ balance: account.balance - amount })
      .eq('id', accountId);

    // Update local state
    setAccounts(prev => prev.map(acc => 
      acc.id === accountId 
        ? { ...acc, balance: acc.balance - amount }
        : acc
    ));

    // Refresh wallet
    await refreshWallet();

    // Fire confetti!
    fireSuccess();

    toast({ 
      title: '💰 Withdrawal Complete!', 
      description: `${formatUGX(amount)} has been transferred to your wallet` 
    });
  };

  const totalFunded = fundedRequests.reduce((sum, r) => sum + Number(r.rent_amount), 0);
  const expectedRewards = fundedRequests
    .filter(r => r.status !== 'completed')
    .reduce((sum, r) => sum + calculateSupporterReward(Number(r.rent_amount)), 0);
  const completedRewards = fundedRequests
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + calculateSupporterReward(Number(r.rent_amount)), 0);
  const activeFundings = fundedRequests.filter(r => r.status !== 'completed').length;

  // Update goal progress when earnings change - using ref to prevent infinite loops
  useEffect(() => {
    if (goals.length > 0 && !loading) {
      const needsUpdate = goals.some(g => g.currentAmount !== completedRewards);
      if (needsUpdate) {
        setGoals(prev => prev.map(g => ({ ...g, currentAmount: completedRewards })));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedRewards, loading]);

  if (loading) {
    return <SupporterDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await fetchData();
  };

  const menuItems = [
    { icon: BarChart3, label: 'Investment Accounts', onClick: () => document.getElementById('accounts-section')?.scrollIntoView({ behavior: 'smooth' }) },
    { icon: Target, label: 'Investment Goals', onClick: () => document.getElementById('goals-section')?.scrollIntoView({ behavior: 'smooth' }) },
    { icon: Wallet, label: 'My Wallet', onClick: () => document.getElementById('wallet-section')?.scrollIntoView({ behavior: 'smooth' }) },
    { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts'), separator: true },
    { icon: History, label: 'Transaction History', onClick: () => navigate('/transactions') },
    { icon: Share2, label: 'Referrals', onClick: () => navigate('/referrals') },
    { icon: FileText, label: 'My Loans', onClick: () => navigate('/my-loans'), separator: true },
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

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Investment Calculator - HERO SECTION */}
        <InvestmentCalculator />

        {/* Create Account CTA + Tenants Available */}
        <motion.div 
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {/* Create Investment Account CTA */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/15 via-violet-500/10 to-primary/5 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300 group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-violet-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute -top-12 sm:-top-16 -right-12 sm:-right-16 w-28 sm:w-40 h-28 sm:h-40 bg-primary/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-8 sm:-bottom-12 -left-8 sm:-left-12 w-24 sm:w-32 h-24 sm:h-32 bg-violet-500/20 rounded-full blur-2xl" />
            
            <CardContent className="relative p-4 sm:p-6 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px] space-y-3 sm:space-y-4">
              <motion.div 
                className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary to-violet-600 shadow-2xl shadow-primary/40"
                whileHover={{ scale: 1.1, rotate: -10 }}
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Plus className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </motion.div>
              
              <div>
                <h3 className="text-base sm:text-xl font-black text-foreground mb-0.5 sm:mb-1">Start Investing Today</h3>
                <p className="text-xs sm:text-sm text-muted-foreground font-medium px-2">Create your investment account and start earning 15% monthly</p>
              </div>
              
              <Button 
                size="default"
                onClick={() => setShowCreateAccount(true)}
                className="gap-1.5 sm:gap-2 bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90 shadow-xl shadow-primary/30 font-bold text-sm sm:text-base px-5 sm:px-8 h-10 sm:h-11"
              >
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Create Account
              </Button>
            </CardContent>
          </Card>

          {/* Tenants Waiting Card */}
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-success/15 via-emerald-500/10 to-success/5 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300 group">
            <div className="absolute inset-0 bg-gradient-to-r from-success/20 via-transparent to-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute -top-12 sm:-top-16 -right-12 sm:-right-16 w-28 sm:w-40 h-28 sm:h-40 bg-success/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-8 sm:-bottom-12 -left-8 sm:-left-12 w-24 sm:w-32 h-24 sm:h-32 bg-emerald-500/20 rounded-full blur-2xl" />
            
            <CardContent className="relative p-4 sm:p-6 flex flex-col items-center justify-center text-center min-h-[160px] sm:min-h-[200px] space-y-3 sm:space-y-4">
              <motion.div 
                className="relative"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br from-success to-emerald-600 shadow-2xl shadow-success/40">
                  <Users className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                {availableRequests.length > 0 && (
                  <motion.div 
                    className="absolute -top-1.5 sm:-top-2 -right-1.5 sm:-right-2 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-warning flex items-center justify-center shadow-lg"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <span className="text-[10px] sm:text-xs font-black text-warning-foreground">{availableRequests.length}</span>
                  </motion.div>
                )}
              </motion.div>
              
              <div>
                <h3 className="text-base sm:text-xl font-black text-foreground mb-0.5 sm:mb-1">Tenants Waiting</h3>
                <p className="text-xs sm:text-sm text-muted-foreground font-medium px-2">
                  {availableRequests.length > 0 
                    ? `${availableRequests.length} tenants need rent funding now`
                    : 'No tenants waiting right now'
                  }
                </p>
              </div>
              
              <Button 
                size="default"
                variant="outline"
                onClick={() => document.getElementById('tenants-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="gap-1.5 sm:gap-2 border-success/30 text-success hover:bg-success/10 font-bold text-sm sm:text-base px-5 sm:px-8 h-10 sm:h-11"
              >
                <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                View & Fund
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tenants Needing Rent */}
        <div id="tenants-section">
          <TenantsNeedingRent
            requests={availableRequests}
            onFund={fundRequest}
            loading={loading}
          />
        </div>

        {/* ========== SECTIONS ACCESSIBLE VIA MENU ========== */}
        
        {/* Investment Accounts Section */}
        <motion.div 
          id="accounts-section"
          className="space-y-4 sm:space-y-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base sm:text-xl font-black">Investment Accounts</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">Manage your portfolios</p>
              </div>
            </div>
            <Button 
              size="sm" 
              onClick={() => setShowCreateAccount(true)}
              className="gap-1.5 sm:gap-2 bg-gradient-to-r from-primary to-violet-500 hover:from-primary/90 hover:to-violet-500/90 shadow-lg shadow-primary/25 text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4"
            >
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">New Portfolio</span>
              <span className="xs:hidden">New</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {accounts.map((account) => (
              <InvestmentAccountCard
                key={account.id}
                account={account}
                onDelete={handleDeleteAccount}
                onEdit={(id) => toast({ title: 'Edit coming soon' })}
                onFund={() => handleFundAccountClick(account)}
                onWithdraw={() => handleWithdrawAccountClick(account)}
                onClick={(acc) => {
                  setSelectedAccountForDetails(acc);
                  setShowAccountDetails(true);
                }}
              />
            ))}
          </div>
        </motion.div>

        {/* Investment Goals */}
        <div id="goals-section">
          <InvestmentGoals
            goals={goals}
            onAddGoal={handleAddGoal}
            onUpdateGoal={handleUpdateGoal}
            onDeleteGoal={handleDeleteGoal}
            totalEarnings={completedRewards}
            monthlyEarnings={expectedRewards}
          />
        </div>

        {/* Interest Payment History */}
        <div id="interest-section">
          <InterestPaymentHistory userId={user.id} />
        </div>

        {/* Invite Supporters Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-background to-violet-500/10 backdrop-blur-xl shadow-xl">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
            <CardContent className="relative p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/20">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Invite Supporters</h3>
                    <p className="text-sm text-muted-foreground">Share with friends & grow together</p>
                  </div>
                </div>
                <ShareSupporterLink variant="default" className="bg-primary hover:bg-primary/90" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Supporter Referral Stats & Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SupporterReferralStats userId={user.id} />
          <SupporterLeaderboard limit={5} />
        </div>

        {/* Wallet */}
        <div id="wallet-section">
          <WalletCard />
        </div>

        {/* My Funded Tenants - Portfolio */}
        <motion.div
          id="portfolio-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-success/5 via-background to-emerald-500/5 backdrop-blur-xl shadow-xl">
            <div className="absolute top-0 right-0 w-32 sm:w-48 h-32 sm:h-48 bg-gradient-to-bl from-success/10 to-transparent rounded-full blur-3xl" />
            
            <CardHeader className="relative pb-2 sm:pb-3 px-3 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                <div className="flex items-center gap-2.5 sm:gap-4">
                  <motion.div 
                    className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-br from-success via-emerald-500 to-green-500 shadow-lg shadow-success/30"
                    whileHover={{ scale: 1.05, rotate: -5 }}
                  >
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                  </motion.div>
                  <div>
                    <CardTitle className="text-base sm:text-xl font-black tracking-tight">Your Portfolio 💼</CardTitle>
                    <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-0.5">Track your investment returns</p>
                  </div>
                </div>
                <Badge className="font-mono text-[10px] sm:text-xs bg-success/20 text-success border-success/30 px-2 sm:px-3 py-0.5 sm:py-1 w-fit">
                  <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                  {fundedRequests.length} total
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="relative px-3 sm:px-6 pb-4 sm:pb-6">
              {fundedRequests.length === 0 ? (
                <div className="text-center py-10 sm:py-16">
                  <motion.div 
                    className="p-4 sm:p-5 rounded-full bg-gradient-to-br from-success/20 to-success/5 w-fit mx-auto mb-4 sm:mb-5"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Wallet className="h-8 w-8 sm:h-10 sm:w-10 text-success/60" />
                  </motion.div>
                  <p className="text-foreground font-bold text-base sm:text-lg">No investments yet 🌱</p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2 max-w-xs mx-auto px-4">
                    Fund your first tenant above to start earning 15% monthly returns
                  </p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {fundedRequests.slice(0, 5).map((request, index) => {
                    const reward = calculateSupporterReward(Number(request.rent_amount));
                    const statusConfig = {
                      completed: { color: 'from-success to-emerald-500', bg: 'bg-success/20', text: 'text-success', label: '✓ Complete' },
                      disbursed: { color: 'from-primary to-violet-500', bg: 'bg-primary/20', text: 'text-primary', label: 'Active' },
                      funded: { color: 'from-warning to-orange-500', bg: 'bg-warning/20', text: 'text-warning', label: 'Funded' },
                    };
                    const status = statusConfig[request.status as keyof typeof statusConfig] || statusConfig.funded;
                    
                    return (
                      <motion.div
                        key={request.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.01, x: 4 }}
                        className="flex items-center justify-between gap-3 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 hover:border-success/30 transition-all duration-300"
                      >
                        <div className="flex items-center gap-2.5 sm:gap-4">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br ${status.color} flex items-center justify-center shadow-lg shrink-0`}>
                            <Coins className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-sm sm:text-lg">{formatUGX(Number(request.rent_amount))}</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">{request.duration_days} days term</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-success text-sm sm:text-lg">+{formatUGX(reward)}</p>
                          <Badge className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0 sm:py-0.5 ${status.bg} ${status.text} border-0`}>
                            {status.label}
                          </Badge>
                        </div>
                      </motion.div>
                    );
                  })}
                  {fundedRequests.length > 5 && (
                    <Button 
                      variant="ghost" 
                      className="w-full mt-2 sm:mt-3 gap-1.5 sm:gap-2 hover:bg-white/10 text-xs sm:text-sm h-9 sm:h-10"
                      onClick={() => navigate('/transactions')}
                    >
                      <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      View All {fundedRequests.length} Investments
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>

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
      
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
