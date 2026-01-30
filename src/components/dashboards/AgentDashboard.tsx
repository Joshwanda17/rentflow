import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  ChevronRight,
  ChevronUp,
  UsersRound,
  Handshake,
  WifiOff,
  RefreshCw,
  BarChart3,
  Target,
  FileText,
  ShoppingBag
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { AgentDepositDialog } from '@/components/agent/AgentDepositDialog';

import { UnifiedRegistrationDialog } from '@/components/agent/UnifiedRegistrationDialog';
import { AgentGoalProgress } from '@/components/agent/AgentGoalProgress';
import { CollapsibleAgentSection } from '@/components/agent/CollapsibleAgentSection';
import { CollapsibleRentRequests } from '@/components/agent/CollapsibleRentRequests';
import { CollapsibleSubAgents } from '@/components/agent/CollapsibleSubAgents';
import { CollapsibleUserInvites } from '@/components/agent/CollapsibleUserInvites';
import { RegisterSubAgentDialog } from '@/components/agent/RegisterSubAgentDialog';
import { ShareSubAgentLink } from '@/components/agent/ShareSubAgentLink';
import { CollapsibleLinkSignups } from '@/components/agent/CollapsibleLinkSignups';
import { ShareReferralLink } from '@/components/agent/ShareReferralLink';
import { CalculatorShareCard } from '@/components/supporter/CalculatorShareCard';
import { RecruitTenantWelileHomes } from '@/components/agent/RecruitTenantWelileHomes';
import AgentRentRequestDialog from '@/components/agent/AgentRentRequestDialog';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { AgentDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FoodReceiptPromoCard } from '@/components/FoodReceiptPromoCard';
import { FoodShoppingLoansSection } from '@/components/loans/FoodShoppingLoansSection';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import MobileQuickMenu from '@/components/MobileQuickMenu';
import { motion, AnimatePresence } from 'framer-motion';
import RoleSwitcher from '@/components/RoleSwitcher';
import { hapticTap } from '@/lib/haptics';
import { AgentAgreementBanner, AgentTermsQuickAccess } from '@/components/agent/agreement';
import { useOffline } from '@/contexts/OfflineContext';
import { OfflineBanner } from '@/components/OfflineBanner';
import { MyCommissionPayouts } from '@/components/agent/MyCommissionPayouts';
import { useWallet } from '@/hooks/useWallet';

interface AgentDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

// Section Header Component
function SectionHeader({ icon: Icon, title, action }: { 
  icon: React.ElementType; 
  title: string; 
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

// Quick Action Button Component
function QuickActionButton({ 
  icon: Icon, 
  label, 
  sublabel,
  onClick, 
  variant = 'default' 
}: { 
  icon: React.ElementType; 
  label: string; 
  sublabel?: string;
  onClick: () => void; 
  variant?: 'primary' | 'success' | 'warning' | 'default';
}) {
  const variantStyles = {
    primary: 'bg-primary/10 text-primary hover:bg-primary/15 border-primary/20',
    success: 'bg-success/10 text-success hover:bg-success/15 border-success/20',
    warning: 'bg-warning/10 text-warning hover:bg-warning/15 border-warning/20',
    default: 'bg-muted/50 text-foreground hover:bg-muted border-border'
  };

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => { hapticTap(); onClick(); }}
      className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-colors touch-manipulation min-h-[72px] ${variantStyles[variant]}`}
    >
      <Icon className="h-5 w-5 mb-1" />
      <span className="text-xs font-medium">{label}</span>
      {sublabel && <span className="text-[10px] opacity-70">{sublabel}</span>}
    </motion.button>
  );
}

// Stats Card Component
function StatsCard({ 
  value, 
  label, 
  icon: Icon, 
  trend,
  onClick 
}: { 
  value: string | number; 
  label: string; 
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
  onClick?: () => void;
}) {
  return (
    <button 
      onClick={onClick}
      className="flex-1 p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-colors text-left"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {trend && (
          <Badge variant={trend.positive ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0">
            {trend.positive ? '+' : ''}{trend.value}%
          </Badge>
        )}
      </div>
      <p className="font-bold text-lg">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </button>
  );
}

export default function AgentDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: AgentDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { totalEarnings, commissionTotal, bonusTotal, refreshEarnings } = useAgentEarnings();
  const { wallet, refreshWallet } = useWallet();
  const { isOnline } = useOffline();
  const [referralCount, setReferralCount] = useState(0);
  const [tenantsCount, setTenantsCount] = useState(0);
  const [subAgentCount, setSubAgentCount] = useState(0);
  const [subAgentEarnings, setSubAgentEarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [registerUserOpen, setRegisterUserOpen] = useState(false);
  const [inviteSubAgentOpen, setInviteSubAgentOpen] = useState(false);
  const [rentRequestOpen, setRentRequestOpen] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  
  // Collapsible sections state
  const [sectionsOpen, setSectionsOpen] = useState({
    rentRequests: false,
    subAgents: false,
    userInvites: false,
    linkSignups: false,
  });
  
  const anyExpanded = Object.values(sectionsOpen).some(v => v);
  
  const collapseAll = () => {
    hapticTap();
    setSectionsOpen({
      rentRequests: false,
      subAgents: false,
      userInvites: false,
      linkSignups: false,
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

  // Real-time subscription for referrals to auto-update count
  useEffect(() => {
    const channel = supabase
      .channel(`agent-referrals-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'referrals',
          filter: `referrer_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[AgentDashboard] New referral detected:', payload);
          setReferralCount((prev) => prev + 1);
          // Also refetch earnings since referral bonus should be credited
          refreshEarnings();
          refreshWallet();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id, refreshEarnings, refreshWallet]);

  const fetchData = async () => {
    if (!navigator.onLine && hasLoadedOnce) {
      setLoading(false);
      return;
    }
    
    if (!hasLoadedOnce) setLoading(true);
    setFetchError(false);
    
    try {
      const [requestsRes, referralsRes, subAgentsRes, subAgentEarningsRes] = await Promise.all([
        supabase.from('rent_requests').select('id').eq('agent_id', user.id),
        supabase.from('referrals').select('id').eq('referrer_id', user.id),
        supabase.from('agent_subagents').select('id').eq('parent_agent_id', user.id),
        supabase.from('agent_earnings').select('amount').eq('agent_id', user.id).eq('earning_type', 'subagent_commission')
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
      
      localStorage.setItem(`agent_dashboard_${user.id}`, JSON.stringify(newData));
      setHasLoadedOnce(true);
    } catch (error) {
      console.warn('[AgentDashboard] Fetch error:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading && isOnline && !hasLoadedOnce) {
    return <AgentDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await Promise.all([fetchData(), refreshEarnings(), refreshWallet()]);
  };

  const handleRegisterUser = () => { hapticTap(); setRegisterUserOpen(true); };
  const handleDeposit = () => { hapticTap(); setDepositOpen(true); };
  const handleInviteSubAgent = () => { hapticTap(); setInviteSubAgentOpen(true); };
  const handleViewWallet = () => { hapticTap(); setShowWallet(!showWallet); };

  const menuItems = [
    { icon: UserPlus, label: 'Register User', onClick: handleRegisterUser },
    { icon: ArrowDownCircle, label: 'Deposit for User', onClick: handleDeposit, separator: true },
    { icon: TrendingUp, label: 'My Earnings', onClick: () => navigate('/earnings') },
    { icon: Store, label: 'My Shop', onClick: () => navigate('/marketplace') },
    { icon: History, label: 'Transactions', onClick: () => navigate('/transactions'), separator: true },
    { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts') },
    { icon: Banknote, label: 'My Loans', onClick: () => navigate('/my-loans'), separator: true },
    { icon: Users, label: 'My Referrals', onClick: () => navigate('/referrals') },
    { icon: Share2, label: 'Invite & Earn', onClick: () => navigate('/benefits') },
    { icon: Download, label: 'Share App', onClick: () => navigate('/install') },
  ];

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-background pb-20 md:pb-0">
      <OfflineBanner />
      
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <main className="px-4 py-4 space-y-6 animate-fade-in max-w-2xl mx-auto">
        {/* Offline/Error Notices */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Card className="border-warning/50 bg-warning/10">
                <CardContent className="p-3 flex items-center gap-3">
                  <WifiOff className="h-4 w-4 text-warning shrink-0" />
                  <p className="text-sm flex-1">Offline mode - viewing cached data</p>
                  <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {fetchError && isOnline && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Card className="border-destructive/50 bg-destructive/10">
                <CardContent className="p-3 flex items-center gap-3">
                  <p className="text-sm flex-1 text-destructive">Connection issue - showing cached data</p>
                  <Button size="sm" variant="ghost" onClick={handleRefresh}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Role Switcher */}
        {availableRoles.length > 1 && (
          <RoleSwitcher currentRole={currentRole} availableRoles={availableRoles} onRoleChange={onRoleChange} variant="prominent" />
        )}

        {/* Agent Agreement Banner */}
        <AgentAgreementBanner />

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1: PROFILE & OVERVIEW
        ═══════════════════════════════════════════════════════════════════ */}
        <Card className="border-0 shadow-md bg-gradient-to-br from-card to-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 mb-4">
              <button onClick={() => navigate('/settings')} className="shrink-0">
                <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-xl truncate">
                  {profile?.full_name || 'Agent'}
                </h1>
                <p className="text-sm text-muted-foreground">Agent Dashboard</p>
              </div>
              {addRoleComponent}
            </div>

            {/* Quick Stats Row */}
            <div className="flex gap-2">
              <StatsCard 
                value={formatUGX(wallet?.balance ?? 0)} 
                label="Wallet Balance" 
                icon={Wallet}
                onClick={handleViewWallet}
              />
              <StatsCard 
                value={tenantsCount + referralCount} 
                label="Users Registered" 
                icon={Users}
                onClick={() => navigate('/agent-registrations')}
              />
              <StatsCard 
                value={subAgentCount} 
                label="Sub-Agents" 
                icon={UsersRound}
                onClick={() => navigate('/sub-agents')}
              />
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2: PRIMARY ACTIONS
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <SectionHeader icon={Target} title="Quick Actions" />
          <div className="grid grid-cols-3 gap-2 mb-2">
            <QuickActionButton icon={UserPlus} label="Register" sublabel="User" onClick={handleRegisterUser} variant="primary" />
            <QuickActionButton icon={Wallet} label="Wallet" onClick={handleViewWallet} variant="success" />
            <QuickActionButton icon={ArrowDownCircle} label="Deposit" onClick={handleDeposit} variant="default" />
          </div>
          {/* Post Rent Request for Tenant */}
          <Button
            onClick={() => { hapticTap(); setRentRequestOpen(true); }}
            variant="outline"
            className="w-full h-12 justify-start gap-3 border-primary/30 hover:bg-primary/5"
          >
            <div className="p-1.5 rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium">Post Rent Request</p>
              <p className="text-[10px] text-muted-foreground">On behalf of tenant without app</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>

        {/* Full-screen wallet sheet */}
        <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />

        {/* Agent Rent Request Dialog */}
        <AgentRentRequestDialog 
          open={rentRequestOpen} 
          onOpenChange={setRentRequestOpen} 
          onSuccess={() => setRentRequestOpen(false)}
        />

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3: EARNINGS OVERVIEW
        ═══════════════════════════════════════════════════════════════════ */}
        <button onClick={() => navigate('/earnings')} className="w-full text-left">
          <Card className="border-success/20 hover:border-success/40 transition-colors">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  Earnings Overview
                </CardTitle>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-success/5 border border-success/10">
                  <p className="font-bold text-success">{formatUGX(commissionTotal)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Commissions</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="font-bold text-primary">{formatUGX(bonusTotal)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Bonuses</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-orange-500/5 border border-orange-500/10">
                  <p className="font-bold text-orange-600 dark:text-orange-400">{formatUGX(subAgentEarnings)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Sub-Agents</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Goal Progress */}
        <AgentGoalProgress />

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 4: GROWTH & REFERRALS
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <SectionHeader 
            icon={Share2} 
            title="Grow Your Network" 
            action={
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/referrals')}>
                View All <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            }
          />
          <div className="space-y-3">
            {/* Calculator Share - Primary for recruiting supporters */}
            <CalculatorShareCard />
            
            <RecruitTenantWelileHomes />
            <ShareReferralLink />
            <ShareSubAgentLink />
            
            {/* Register Sub-Agent Directly */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleInviteSubAgent}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border hover:border-primary/30 transition-colors touch-manipulation"
            >
              <div className="p-2 rounded-lg bg-primary/10">
                <Handshake className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-sm">Register Sub-Agent Directly</p>
                <p className="text-xs text-muted-foreground">Create account for someone you know</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </motion.button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 5: BUSINESS TOOLS
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <SectionHeader icon={BarChart3} title="Business Tools" />
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              className="h-auto py-3 px-4 justify-start gap-3"
              onClick={() => navigate('/marketplace')}
            >
              <Store className="h-4 w-4 text-primary" />
              <div className="text-left">
                <p className="font-medium text-sm">My Shop</p>
                <p className="text-[10px] text-muted-foreground">Manage products</p>
              </div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-3 px-4 justify-start gap-3"
              onClick={() => navigate('/transactions')}
            >
              <History className="h-4 w-4 text-primary" />
              <div className="text-left">
                <p className="font-medium text-sm">Transactions</p>
                <p className="text-[10px] text-muted-foreground">View history</p>
              </div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-3 px-4 justify-start gap-3"
              onClick={() => navigate('/my-receipts')}
            >
              <Receipt className="h-4 w-4 text-primary" />
              <div className="text-left">
                <p className="font-medium text-sm">Receipts</p>
                <p className="text-[10px] text-muted-foreground">Scan & earn</p>
              </div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto py-3 px-4 justify-start gap-3"
              onClick={() => navigate('/my-loans')}
            >
              <Banknote className="h-4 w-4 text-primary" />
              <div className="text-left">
                <p className="font-medium text-sm">My Loans</p>
                <p className="text-[10px] text-muted-foreground">Manage loans</p>
              </div>
            </Button>
          </div>
        </div>

        <Separator className="my-2" />

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 6: MANAGEMENT (Collapsible Sections)
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="font-semibold text-sm text-foreground">Management</h2>
            </div>
            <AnimatePresence>
              {anyExpanded && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                  <Button variant="ghost" size="sm" onClick={collapseAll} className="h-7 text-xs gap-1">
                    <ChevronUp className="h-3 w-3" />
                    Collapse
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-2">
            <CollapsibleAgentSection
              icon={Banknote}
              label="My Withdrawals"
              iconColor="text-success"
            >
              <MyCommissionPayouts minimal />
            </CollapsibleAgentSection>
            <CollapsibleLinkSignups isOpen={sectionsOpen.linkSignups} onToggle={() => toggleSection('linkSignups')} />
            <CollapsibleRentRequests isOpen={sectionsOpen.rentRequests} onToggle={() => toggleSection('rentRequests')} />
            <CollapsibleSubAgents isOpen={sectionsOpen.subAgents} onToggle={() => toggleSection('subAgents')} />
            <CollapsibleUserInvites isOpen={sectionsOpen.userInvites} onToggle={() => toggleSection('userInvites')} />
          </div>
        </div>

        <Separator className="my-2" />

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 7: LEGAL & EXTRAS
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <AgentTermsQuickAccess />
          <FoodReceiptPromoCard userId={user.id} />
          <FoodShoppingLoansSection />
        </div>
      </main>
      
      {/* Dialogs */}
      <AgentDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <UnifiedRegistrationDialog 
        open={registerUserOpen} 
        onOpenChange={setRegisterUserOpen}
        onSuccess={() => { fetchData(); refreshEarnings(); }}
      />
      <RegisterSubAgentDialog
        open={inviteSubAgentOpen}
        onOpenChange={setInviteSubAgentOpen}
        onSuccess={() => { fetchData(); refreshEarnings(); }}
      />
      
      <FloatingShareButton />
      <MobileQuickMenu currentRole={currentRole} />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
