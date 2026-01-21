import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Coins, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Store, 
  Banknote, 
  Receipt, 
  Share2, 
  History,
  TrendingUp,
  Download,
  UserPlus,
  Wallet,
  Menu,
  Sparkles,
  ChevronRight,
  UsersRound,
  Lock
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import { WalletCard } from '@/components/wallet/WalletCard';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { AgentDepositDialog } from '@/components/agent/AgentDepositDialog';
import { AgentWithdrawalDialog } from '@/components/agent/AgentWithdrawalDialog';
import { UnifiedRegistrationDialog } from '@/components/agent/UnifiedRegistrationDialog';
import { AgentInvitesList } from '@/components/agent/AgentInvitesList';
import { AgentGoalProgress } from '@/components/agent/AgentGoalProgress';
import { AgentRentRequestsManager } from '@/components/agent/AgentRentRequestsManager';
import { SubAgentsList } from '@/components/agent/SubAgentsList';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { AgentDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FoodReceiptPromoCard } from '@/components/FoodReceiptPromoCard';
import { FoodShoppingLoansSection } from '@/components/loans/FoodShoppingLoansSection';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import MobileQuickMenu from '@/components/MobileQuickMenu';
import { CollapsibleQuickNav } from '@/components/CollapsibleQuickNav';
import { motion } from 'framer-motion';
import RoleSwitcher from '@/components/RoleSwitcher';
import { hapticTap } from '@/lib/haptics';
import { AgentAgreementBanner } from '@/components/agent/agreement';
import { useAgentAgreement } from '@/hooks/useAgentAgreement';
import { useToast } from '@/hooks/use-toast';

interface AgentDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

export default function AgentDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: AgentDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { totalEarnings, refreshEarnings } = useAgentEarnings();
  const { isAccepted: hasAcceptedTerms, isLoading: termsLoading } = useAgentAgreement();
  const { toast } = useToast();
  const [referralCount, setReferralCount] = useState(0);
  const [tenantsCount, setTenantsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [registerUserOpen, setRegisterUserOpen] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [requestsRes, referralsRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id')
        .eq('agent_id', user.id),
      supabase
        .from('referrals')
        .select('id')
        .eq('referrer_id', user.id)
    ]);
    
    setTenantsCount(requestsRes.data?.length || 0);
    setReferralCount(referralsRes.data?.length || 0);
    setLoading(false);
  };

  if (loading) {
    return <AgentDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await Promise.all([fetchData(), refreshEarnings()]);
  };

  // Show toast when trying to use locked features
  const showLockedToast = () => {
    toast({
      title: "Accept Terms Required",
      description: "Please accept the Agent Terms & Conditions to unlock this feature.",
      variant: "destructive"
    });
  };

  const handleRegisterUser = () => {
    hapticTap();
    if (!hasAcceptedTerms) {
      showLockedToast();
      return;
    }
    setRegisterUserOpen(true);
  };

  const handleDeposit = () => {
    hapticTap();
    if (!hasAcceptedTerms) {
      showLockedToast();
      return;
    }
    setDepositOpen(true);
  };

  const handleWithdrawal = () => {
    hapticTap();
    if (!hasAcceptedTerms) {
      showLockedToast();
      return;
    }
    setWithdrawalOpen(true);
  };

  const handleViewWallet = () => {
    hapticTap();
    setShowWallet(!showWallet);
  };

  const menuItems = [
    { icon: UserPlus, label: 'Register User', onClick: handleRegisterUser },
    { icon: ArrowDownCircle, label: 'Deposit for User', onClick: handleDeposit },
    { icon: ArrowUpCircle, label: 'Withdraw for User', onClick: handleWithdrawal, separator: true },
    { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts') },
    { icon: Banknote, label: 'My Loans', onClick: () => navigate('/my-loans') },
    { icon: Store, label: 'My Shop', onClick: () => navigate('/marketplace') },
    { icon: TrendingUp, label: 'Earnings', onClick: () => navigate('/earnings'), separator: true },
    { icon: History, label: 'Transactions', onClick: () => navigate('/transactions') },
    { icon: Users, label: 'Referrals', onClick: () => navigate('/referrals') },
    { icon: Share2, label: 'Share & Earn', onClick: () => navigate('/benefits') },
    { icon: Download, label: 'Share App', onClick: () => navigate('/install') },
  ];

  // Other actions for the collapsible menu - show lock icon if terms not accepted
  const otherActions = [
    { icon: hasAcceptedTerms ? UserPlus : Lock, label: 'Register', onClick: handleRegisterUser, variant: 'primary' as const },
    { icon: hasAcceptedTerms ? ArrowDownCircle : Lock, label: 'Deposit', onClick: handleDeposit, variant: 'success' as const },
    { icon: hasAcceptedTerms ? ArrowUpCircle : Lock, label: 'Withdraw', onClick: handleWithdrawal, variant: 'default' as const },
    { icon: Store, label: 'My Shop', onClick: () => navigate('/marketplace'), variant: 'warning' as const },
    { icon: Receipt, label: 'Receipts', onClick: () => navigate('/my-receipts') },
    { icon: Banknote, label: 'Loans', onClick: () => navigate('/my-loans') },
    { icon: TrendingUp, label: 'Earnings', onClick: () => navigate('/earnings'), variant: 'success' as const },
    { icon: Users, label: 'Referrals', onClick: () => navigate('/referrals') },
    { icon: History, label: 'History', onClick: () => navigate('/transactions') },
  ];

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-background pb-20 md:pb-0">
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <main className="px-4 py-4 space-y-5 animate-fade-in">
        {/* Role Switcher - Prominent placement for multi-role users */}
        {availableRoles.length > 1 && (
          <RoleSwitcher
            currentRole={currentRole}
            availableRoles={availableRoles}
            onRoleChange={onRoleChange}
            variant="prominent"
          />
        )}

        {/* Agent Agreement Banner - Show if not accepted */}
        <AgentAgreementBanner />

        {/* Agent Welcome & Stats Header */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/settings')}
            className="shrink-0"
          >
            <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-xl truncate">
              {profile?.full_name?.split(' ')[0] || 'Agent'}
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Coins className="h-3.5 w-3.5 text-success" />
                {formatUGX(totalEarnings)}
              </span>
              <span>•</span>
              <span>{tenantsCount + referralCount} users</span>
            </div>
          </div>
          {addRoleComponent}
        </div>

        {/* Two Main Action Buttons - Hero Section */}
        <div className="grid grid-cols-2 gap-3">
          {/* Register User - Primary Action */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleRegisterUser}
            className={`relative overflow-hidden rounded-2xl p-5 shadow-lg active:shadow-md transition-shadow ${
              hasAcceptedTerms 
                ? 'bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-primary/25' 
                : 'bg-gradient-to-br from-muted via-muted to-muted/80 text-muted-foreground'
            }`}
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative z-10 flex flex-col items-center text-center gap-3">
              <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
                {hasAcceptedTerms ? <UserPlus className="h-7 w-7" /> : <Lock className="h-7 w-7" />}
              </div>
              <div>
                <p className="font-bold text-base">Register User</p>
                <p className="text-xs opacity-80 mt-0.5">
                  {hasAcceptedTerms ? 'Earn commission' : 'Accept terms first'}
                </p>
              </div>
            </div>
            
            {hasAcceptedTerms && <Sparkles className="absolute top-3 right-3 h-4 w-4 opacity-60" />}
            {!hasAcceptedTerms && <Lock className="absolute top-3 right-3 h-4 w-4 opacity-60" />}
          </motion.button>

          {/* View Wallet - Secondary Action */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleViewWallet}
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-success via-success to-success/80 p-5 text-success-foreground shadow-lg shadow-success/25 active:shadow-md transition-shadow"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative z-10 flex flex-col items-center text-center gap-3">
              <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
                <Wallet className="h-7 w-7" />
              </div>
              <div>
                <p className="font-bold text-base">My Wallet</p>
                <p className="text-xs opacity-80 mt-0.5">View balance</p>
              </div>
            </div>
            
            <Coins className="absolute top-3 right-3 h-4 w-4 opacity-60" />
          </motion.button>
        </div>

        {/* Expandable Wallet Section */}
        {showWallet && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <WalletCard />
          </motion.div>
        )}

        {/* Quick Earnings Indicator - Compact */}
        <button 
          onClick={() => navigate('/earnings')}
          className="w-full"
        >
          <Card className="border border-success/30 bg-success/5 hover:bg-success/10 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-success/15">
                    <TrendingUp className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="font-semibold text-success text-lg">{formatUGX(totalEarnings)}</p>
                    <p className="text-xs text-muted-foreground">Total Earnings</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <p className="font-bold">{tenantsCount}</p>
                    <p className="text-[10px] text-muted-foreground">Tenants</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold">{referralCount}</p>
                    <p className="text-[10px] text-muted-foreground">Referrals</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Monthly Goal Progress */}
        <AgentGoalProgress />

        {/* More Actions - Hidden in Collapsible Menu */}
        <CollapsibleQuickNav 
          buttonLabel="More Actions"
          title="All Features"
          items={otherActions}
        />

        {/* Food Receipt Promo */}
        <FoodReceiptPromoCard userId={user.id} />

        {/* Rent Requests - Agents can approve/reject */}
        <AgentRentRequestsManager />

        {/* Sub-Agents List */}
        <SubAgentsList />

        {/* Registered Users List */}
        <AgentInvitesList />

        {/* Food Shopping Loans */}
        <FoodShoppingLoansSection />
      </main>
      
      <AgentDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <AgentWithdrawalDialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen} />
      <UnifiedRegistrationDialog 
        open={registerUserOpen} 
        onOpenChange={setRegisterUserOpen}
        onSuccess={() => {
          fetchData();
          refreshEarnings();
        }}
      />
      
      <FloatingShareButton />
      <MobileQuickMenu currentRole={currentRole} />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
