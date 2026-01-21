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
  Sparkles,
  ChevronRight,
  ChevronUp,
  UsersRound,
  Handshake,
  WifiOff,
  RefreshCw
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

import { AgentGoalProgress } from '@/components/agent/AgentGoalProgress';
import { CollapsibleRentRequests } from '@/components/agent/CollapsibleRentRequests';
import { CollapsibleSubAgents } from '@/components/agent/CollapsibleSubAgents';
import { CollapsibleUserInvites } from '@/components/agent/CollapsibleUserInvites';
import { RegisterSubAgentDialog } from '@/components/agent/RegisterSubAgentDialog';
import { ShareSubAgentLink } from '@/components/agent/ShareSubAgentLink';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { AgentDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FoodReceiptPromoCard } from '@/components/FoodReceiptPromoCard';
import { FoodShoppingLoansSection } from '@/components/loans/FoodShoppingLoansSection';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import MobileQuickMenu from '@/components/MobileQuickMenu';
import { CollapsibleQuickNav } from '@/components/CollapsibleQuickNav';
import { motion, AnimatePresence } from 'framer-motion';
import RoleSwitcher from '@/components/RoleSwitcher';
import { hapticTap } from '@/lib/haptics';
import { AgentAgreementBanner } from '@/components/agent/agreement';
import { useOffline } from '@/contexts/OfflineContext';
import { OfflineBanner } from '@/components/OfflineBanner';

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
  const { totalEarnings, commissionTotal, bonusTotal, refreshEarnings } = useAgentEarnings();
  const { isOnline } = useOffline();
  const [referralCount, setReferralCount] = useState(0);
  const [tenantsCount, setTenantsCount] = useState(0);
  const [subAgentCount, setSubAgentCount] = useState(0);
  const [subAgentEarnings, setSubAgentEarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [registerUserOpen, setRegisterUserOpen] = useState(false);
  const [inviteSubAgentOpen, setInviteSubAgentOpen] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  
  // Collapsible sections state
  const [sectionsOpen, setSectionsOpen] = useState({
    rentRequests: false,
    subAgents: false,
    userInvites: false,
  });
  
  const anyExpanded = Object.values(sectionsOpen).some(v => v);
  
  const collapseAll = () => {
    hapticTap();
    setSectionsOpen({
      rentRequests: false,
      subAgents: false,
      userInvites: false,
    });
  };
  
  const toggleSection = (section: keyof typeof sectionsOpen) => {
    setSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Load cached data from localStorage on mount
  useEffect(() => {
    const cached = localStorage.getItem(`agent_dashboard_${user.id}`);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        setTenantsCount(data.tenantsCount || 0);
        setReferralCount(data.referralCount || 0);
        setSubAgentCount(data.subAgentCount || 0);
        setSubAgentEarnings(data.subAgentEarnings || 0);
        setHasLoadedOnce(true);
      } catch (e) {
        console.warn('[AgentDashboard] Failed to parse cached data');
      }
    }
    fetchData();
  }, [user.id]);

  const fetchData = async () => {
    if (!hasLoadedOnce) setLoading(true);
    setFetchError(false);
    
    try {
      const [requestsRes, referralsRes, subAgentsRes, subAgentEarningsRes] = await Promise.all([
        supabase
          .from('rent_requests')
          .select('id')
          .eq('agent_id', user.id),
        supabase
          .from('referrals')
          .select('id')
          .eq('referrer_id', user.id),
        supabase
          .from('agent_subagents')
          .select('id')
          .eq('parent_agent_id', user.id),
        supabase
          .from('agent_earnings')
          .select('amount')
          .eq('agent_id', user.id)
          .eq('earning_type', 'subagent_commission')
      ]);
      
      const newData = {
        tenantsCount: requestsRes.data?.length || 0,
        referralCount: referralsRes.data?.length || 0,
        subAgentCount: subAgentsRes.data?.length || 0,
        subAgentEarnings: subAgentEarningsRes.data?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0
      };
      
      setTenantsCount(newData.tenantsCount);
      setReferralCount(newData.referralCount);
      setSubAgentCount(newData.subAgentCount);
      setSubAgentEarnings(newData.subAgentEarnings);
      
      // Cache the data for offline use
      localStorage.setItem(`agent_dashboard_${user.id}`, JSON.stringify(newData));
      setHasLoadedOnce(true);
    } catch (error) {
      console.warn('[AgentDashboard] Fetch error:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  // Show skeleton only on first load with no cached data
  if (loading && !hasLoadedOnce) {
    return <AgentDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await Promise.all([fetchData(), refreshEarnings()]);
  };

  const handleRegisterUser = () => {
    hapticTap();
    setRegisterUserOpen(true);
  };

  const handleDeposit = () => {
    hapticTap();
    setDepositOpen(true);
  };

  const handleWithdrawal = () => {
    hapticTap();
    setWithdrawalOpen(true);
  };

  const handleInviteSubAgent = () => {
    hapticTap();
    setInviteSubAgentOpen(true);
  };

  const handleViewWallet = () => {
    hapticTap();
    setShowWallet(!showWallet);
  };

  // Header menu - organized by category with separators
  const menuItems = [
    // User Operations
    { icon: UserPlus, label: 'Register User', onClick: handleRegisterUser },
    { icon: ArrowDownCircle, label: 'Deposit for User', onClick: handleDeposit },
    { icon: ArrowUpCircle, label: 'Withdraw for User', onClick: handleWithdrawal, separator: true },
    // My Business
    { icon: TrendingUp, label: 'My Earnings', onClick: () => navigate('/earnings') },
    { icon: Store, label: 'My Shop', onClick: () => navigate('/marketplace') },
    { icon: History, label: 'Transactions', onClick: () => navigate('/transactions'), separator: true },
    // My Records
    { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts') },
    { icon: Banknote, label: 'My Loans', onClick: () => navigate('/my-loans'), separator: true },
    // Network & Growth
    { icon: Users, label: 'My Referrals', onClick: () => navigate('/referrals') },
    { icon: Share2, label: 'Invite & Earn', onClick: () => navigate('/benefits') },
    { icon: Download, label: 'Share App', onClick: () => navigate('/install') },
  ];

  // Collapsible quick actions - organized with visual hierarchy
  const otherActions = [
    // Primary agent actions
    { icon: UserPlus, label: 'Register', onClick: handleRegisterUser, variant: 'primary' as const },
    { icon: ArrowDownCircle, label: 'Deposit', onClick: handleDeposit, variant: 'success' as const },
    { icon: ArrowUpCircle, label: 'Withdraw', onClick: handleWithdrawal, variant: 'warning' as const },
    { icon: TrendingUp, label: 'Earnings', onClick: () => navigate('/earnings'), variant: 'success' as const },
    // Business tools
    { icon: Store, label: 'Shop', onClick: () => navigate('/marketplace') },
    { icon: Receipt, label: 'Receipts', onClick: () => navigate('/my-receipts') },
    { icon: Banknote, label: 'Loans', onClick: () => navigate('/my-loans') },
    { icon: History, label: 'History', onClick: () => navigate('/transactions') },
  ];

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Offline Banner - Shows when offline or syncing */}
      <OfflineBanner />
      
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <main className="px-4 py-4 space-y-5 animate-fade-in">
        {/* Offline Notice Card - Prominent when offline */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Card className="border-warning/50 bg-warning/10">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-full bg-warning/20">
                    <WifiOff className="h-5 w-5 text-warning" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">You're Offline</p>
                    <p className="text-xs text-muted-foreground">
                      Viewing cached data. Changes will sync when online.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => window.location.reload()}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fetch Error Notice */}
        <AnimatePresence>
          {fetchError && isOnline && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Card className="border-destructive/50 bg-destructive/10">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-medium text-sm text-destructive">Connection Issue</p>
                    <p className="text-xs text-muted-foreground">
                      Couldn't load latest data. Showing cached version.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefresh}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Coins className="h-3.5 w-3.5 text-success" />
                {formatUGX(totalEarnings)}
              </span>
              <span>•</span>
              <span>{tenantsCount + referralCount} users</span>
              {subAgentCount > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <UsersRound className="h-3.5 w-3.5 text-orange-500" />
                    {subAgentCount} sub-agent{subAgentCount !== 1 ? 's' : ''}
                  </span>
                </>
              )}
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
            className="relative overflow-hidden rounded-2xl p-5 shadow-lg active:shadow-md transition-shadow bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-primary/25"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative z-10 flex flex-col items-center text-center gap-3">
              <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
                <UserPlus className="h-7 w-7" />
              </div>
              <div>
                <p className="font-bold text-base">Register User</p>
                <p className="text-xs opacity-80 mt-0.5">Earn commission</p>
              </div>
            </div>
            
            <Sparkles className="absolute top-3 right-3 h-4 w-4 opacity-60" />
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

        {/* Share Sub-Agent Referral Link - Prominent */}
        <ShareSubAgentLink />

        {/* Invite Sub-Agent Quick Action (for direct registration) */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleInviteSubAgent}
          className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 hover:border-primary/40 transition-colors touch-manipulation"
        >
          <div className="p-3 rounded-xl bg-primary/10">
            <Handshake className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold">Register Sub-Agent Directly</p>
            <p className="text-sm text-muted-foreground">Create account for someone you know</p>
          </div>
          <ChevronRight className="h-5 w-5 text-primary/60" />
        </motion.button>

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

        {/* Quick Earnings Indicator with Breakdown */}
        <button 
          onClick={() => navigate('/earnings')}
          className="w-full"
        >
          <Card className="border border-success/30 bg-success/5 hover:bg-success/10 transition-colors">
            <CardContent className="p-4 space-y-3">
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
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
              
              {/* Earnings Breakdown */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
                <div className="text-center p-2 rounded-lg bg-background/50">
                  <p className="font-bold text-sm">{formatUGX(commissionTotal)}</p>
                  <p className="text-[10px] text-muted-foreground">Repayments</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-background/50">
                  <p className="font-bold text-sm">{formatUGX(bonusTotal)}</p>
                  <p className="text-[10px] text-muted-foreground">Bonuses</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-orange-500/10">
                  <p className="font-bold text-sm text-orange-600 dark:text-orange-400">{formatUGX(subAgentEarnings)}</p>
                  <p className="text-[10px] text-muted-foreground">Sub-Agents</p>
                </div>
              </div>
              
              {/* Quick Stats Row */}
              <div className="flex items-center justify-around text-xs text-muted-foreground pt-1">
                <span>{tenantsCount} tenants</span>
                <span className="text-border">•</span>
                <span>{referralCount} referrals</span>
                <span className="text-border">•</span>
                <span className="text-orange-500">{subAgentCount} sub-agents</span>
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

        {/* Collapse All Button - Show when any section is expanded */}
        {anyExpanded && (
          <Button
            variant="ghost"
            size="sm"
            onClick={collapseAll}
            className="w-full text-muted-foreground gap-2"
          >
            <ChevronUp className="h-4 w-4" />
            Collapse All Sections
          </Button>
        )}

        {/* Rent Requests - Hidden behind collapsible button */}
        <CollapsibleRentRequests 
          isOpen={sectionsOpen.rentRequests}
          onToggle={() => toggleSection('rentRequests')}
        />

        {/* Sub-Agents - Hidden behind collapsible button */}
        <CollapsibleSubAgents 
          isOpen={sectionsOpen.subAgents}
          onToggle={() => toggleSection('subAgents')}
        />

        {/* Registered Users - Hidden behind collapsible button */}
        <CollapsibleUserInvites 
          isOpen={sectionsOpen.userInvites}
          onToggle={() => toggleSection('userInvites')}
        />

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
      <RegisterSubAgentDialog
        open={inviteSubAgentOpen}
        onOpenChange={setInviteSubAgentOpen}
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
