import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';

import AiIdButton from '@/components/ai-id/AiIdButton';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { 
  UserPlus,
  Wallet,
  Menu,
  WifiOff,
  RefreshCw,
  BadgeCheck,
  Home,
  TrendingUp,
  Banknote,
  FileText,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUGX } from '@/lib/rentCalculations';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { WalletDisclaimer } from '@/components/wallet/WalletDisclaimer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { AgentDepositDialog } from '@/components/agent/AgentDepositDialog';
import { UnifiedRegistrationDialog } from '@/components/agent/UnifiedRegistrationDialog';
import { RegisterSubAgentDialog } from '@/components/agent/RegisterSubAgentDialog';
import AgentRentRequestDialog from '@/components/agent/AgentRentRequestDialog';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { AgentDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';

import { hapticTap } from '@/lib/haptics';
import { AgentAgreementBanner } from '@/components/agent/agreement';
import { VerificationChecklist } from '@/components/shared/VerificationChecklist';
import { useOffline } from '@/contexts/OfflineContext';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useOfflineAgentDashboard } from '@/hooks/useOfflineAgentDashboard';
import { useWallet } from '@/hooks/useWallet';
import { EarningsRankSystemSheet } from '@/components/agent/EarningsRankSystemSheet';
import { AgentMenuDrawer } from '@/components/agent/AgentMenuDrawer';
import { AgentActionInsights } from '@/components/agent/AgentActionInsights';
import { AgentManagedPropertyDialog } from '@/components/agent/AgentManagedPropertyDialog';
import { AgentManagedPropertiesSheet } from '@/components/agent/AgentManagedPropertiesSheet';
import { AgentLandlordPayoutDialog } from '@/components/agent/AgentLandlordPayoutDialog';
import { VerificationOpportunitiesButton } from '@/components/agent/VerificationOpportunitiesButton';
import { CreditVerificationButton } from '@/components/agent/CreditVerificationButton';
import { AgentMyRentRequestsSheet } from '@/components/agent/AgentMyRentRequestsSheet';
import { AgentTenantsSheet } from '@/components/agent/AgentTenantsSheet';

import { AgentTopUpTenantDialog } from '@/components/agent/AgentTopUpTenantDialog';
import { AgentInvestForPartnerDialog } from '@/components/agent/AgentInvestForPartnerDialog';
import { ProxyInvestmentHistorySheet } from '@/components/agent/ProxyInvestmentHistorySheet';
import { AgentReceiptDialog } from '@/components/agent/AgentReceiptDialog';
import { AgentLandlordMapSheet } from '@/components/agent/AgentLandlordMapSheet';
import { RentalFinderSheet } from '@/components/agent/RentalFinderSheet';
import { ListEmptyHouseDialog } from '@/components/agent/ListEmptyHouseDialog';
import { AgentListingsSheet } from '@/components/agent/AgentListingsSheet';
import { NearbyTenantsSheet } from '@/components/agent/NearbyTenantsSheet';
import { MySubAgentsSheet } from '@/components/agent/MySubAgentsSheet';
import { RecruitSubAgentCTA } from '@/components/agent/RecruitSubAgentCTA';
import { QuickShareSubAgentSheet } from '@/components/agent/QuickShareSubAgentSheet';
import { Card, CardContent } from '@/components/ui/card';
import { staggerDelay } from '@/lib/cssAnimations';
import { CreditAccessCard } from '@/components/CreditAccessCard';
import { ApprovedRentRequestsWidget } from '@/components/rent/ApprovedRentRequestsWidget';
import { RecentAutoCharges } from '@/components/wallet/RecentAutoCharges';
import { AgentTenantRentRequestsList } from '@/components/agent/AgentTenantRentRequestsList';
import { AgentVerificationOpportunitiesCard } from '@/components/agent/AgentVerificationOpportunitiesCard';

// New Phase 1 components
import { AgentDailyOpsCard } from '@/components/agent/AgentDailyOpsCard';
import { AgentVisitPaymentWizard } from '@/components/agent/AgentVisitPaymentWizard';
import { GeneratePaymentTokenDialog } from '@/components/agent/GeneratePaymentTokenDialog';
import { RecordAgentCollectionDialog } from '@/components/agent/RecordAgentCollectionDialog';
import { AgentDepositCashDialog } from '@/components/agent/AgentDepositCashDialog';

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
  const { refreshEarnings } = useAgentEarnings();
  const { wallet, refreshWallet } = useWallet();
  const { isOnline } = useOffline();
  
  const { 
    stats, 
    isLoading: loading, 
    refreshData: refreshOfflineData, 
    hasLoadedOnce 
  } = useOfflineAgentDashboard();
  
  const { tenantsCount, referralCount, subAgentCount } = stats;
  
  const [depositOpen, setDepositOpen] = useState(false);
  const [registerUserOpen, setRegisterUserOpen] = useState(false);
  const [inviteSubAgentOpen, setInviteSubAgentOpen] = useState(false);
  const [rentRequestOpen, setRentRequestOpen] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [earningsRankOpen, setEarningsRankOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [managedPropertyOpen, setManagedPropertyOpen] = useState(false);
  const [managedPropertiesSheetOpen, setManagedPropertiesSheetOpen] = useState(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutProperty, setPayoutProperty] = useState<any>(null);
  const [myRentRequestsOpen, setMyRentRequestsOpen] = useState(false);
  
  const [topUpTenantOpen, setTopUpTenantOpen] = useState(false);
  const [tenantsSheetOpen, setTenantsSheetOpen] = useState(false);
  const [investForPartnerOpen, setInvestForPartnerOpen] = useState(false);
  const [proxyHistoryOpen, setProxyHistoryOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [landlordMapOpen, setLandlordMapOpen] = useState(false);
  const [rentalFinderOpen, setRentalFinderOpen] = useState(false);
  const [listHouseOpen, setListHouseOpen] = useState(false);
  const [myListingsOpen, setMyListingsOpen] = useState(false);

  // Phase 1: Agent Operations dialogs
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [recordCollectionOpen, setRecordCollectionOpen] = useState(false);
  const [depositCashOpen, setDepositCashOpen] = useState(false);
  const [nearbyTenantsOpen, setNearbyTenantsOpen] = useState(false);
  const [applyingToSell, setApplyingToSell] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [subAgentsSheetOpen, setSubAgentsSheetOpen] = useState(false);
  const [shareLinkOpen, setShareLinkOpen] = useState(false);

  const handleApplyToSell = async () => {
    setApplyingToSell(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase
        .from('profiles')
        .update({ seller_application_status: 'pending' })
        .eq('id', user.id);
      if (error) throw error;
      const { toast } = await import('sonner');
      toast.success('Application submitted! A manager will review your request.');
    } catch (err) {
      const { toast } = await import('sonner');
      toast.error('Failed to submit application');
    } finally {
      setApplyingToSell(false);
    }
  };

  if (loading && isOnline && !hasLoadedOnce) {
    return <AgentDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await Promise.all([refreshOfflineData(), refreshEarnings(), refreshWallet()]);
  };

  const handleRegisterUser = () => { hapticTap(); setRegisterUserOpen(true); };
  const handleDeposit = () => { hapticTap(); setDepositOpen(true); };
  const handleInviteSubAgent = () => { hapticTap(); setInviteSubAgentOpen(true); };
  const handleViewWallet = () => { hapticTap(); setShowWallet(true); };
  const handleOpenMenu = () => { hapticTap(); setMenuOpen(true); };

  const menuItems = [
    { icon: UserPlus, label: 'Register User', onClick: handleRegisterUser },
  ];

  const quickActions = [] as any[];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <OfflineBanner />
      
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto pb-28 md:pb-4">
        <main className="px-4 py-5 space-y-5 animate-fade-in max-w-lg mx-auto">
        {/* Offline Notice */}
        {!isOnline && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-warning/10 border border-warning/20 animate-fade-in">
            <WifiOff className="h-3.5 w-3.5 text-warning shrink-0" />
            <p className="text-xs text-warning flex-1">You're offline — data may be outdated</p>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        )}

        <AgentAgreementBanner />

        {/* Profile + Name + AI ID */}
        <div className="flex items-center gap-3 animate-fade-in">
          <button onClick={() => navigate('/settings')} className="shrink-0">
            <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-xl leading-tight flex items-center gap-1.5 flex-wrap">
              <span className="break-words">{profile?.full_name || 'Agent'}</span>
              {profile?.verified && (
                <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 shrink-0" />
              )}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Welile Agent{profile?.territory ? ` · ${profile.territory}` : ''}</p>
          </div>
          <AiIdButton variant="compact" />
        </div>

        {/* Wallet — Most Prominent */}
        <button
          onClick={handleViewWallet}
          className="group w-full rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all touch-manipulation animate-fade-in active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/15 group-hover:bg-primary/25 transition-colors shrink-0">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Wallet Balance</p>
              <p className="font-bold text-2xl text-foreground truncate mt-0.5">{formatUGX(wallet?.balance ?? 0)}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {profile?.phone && (
                <>
                  {/^(\+?256)?0?(77|78|76)/.test(profile.phone) && (
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[hsl(48,100%,50%)] text-[7px] font-black text-[hsl(220,20%,20%)] leading-none">M</span>
                  )}
                  {/^(\+?256)?0?(75|70|74)/.test(profile.phone) && (
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[hsl(0,85%,50%)] text-[7px] font-black text-white leading-none">A</span>
                  )}
                </>
              )}
              <span className="text-lg text-muted-foreground group-hover:text-primary transition-colors">›</span>
            </div>
          </div>
        </button>

        {/* Verification Checklist */}
        <VerificationChecklist userId={user.id} highlightRole="agent" compact />

        {/* Recruit Sub-Agents CTA */}
        <RecruitSubAgentCTA
          onRegister={() => setInviteSubAgentOpen(true)}
          onViewSubAgents={() => setSubAgentsSheetOpen(true)}
          onShareLink={() => setShareLinkOpen(true)}
        />

        {/* Action Insights: Daily Rent, Forecast, Streak, Priority Queue */}
        <AgentActionInsights agentId={user.id} />

        {/* 5 Key Action Buttons + Hub */}
        <div className="grid grid-cols-3 gap-2 animate-fade-in">
          {[
            { icon: Banknote, label: 'Pay Rent', onClick: () => setTopUpTenantOpen(true), color: 'text-primary', bg: 'bg-primary/10 border-primary/30 hover:bg-primary/15' },
            { icon: FileText, label: 'Post Request', onClick: () => setRentRequestOpen(true), color: 'text-success', bg: 'bg-success/15 border-success/40 hover:bg-success/20 ring-1 ring-success/30' },
            { icon: Users, label: 'Tenants', onClick: () => setTenantsSheetOpen(true), color: 'text-primary', bg: 'bg-primary/10 border-primary/30 hover:bg-primary/15' },
            { icon: Home, label: 'List House', onClick: () => setListHouseOpen(true), color: 'text-chart-4', bg: 'bg-chart-4/10 border-chart-4/30 hover:bg-chart-4/15' },
            { icon: TrendingUp, label: 'Credit', onClick: () => setCreditOpen(prev => !prev), color: 'text-warning', bg: 'bg-warning/10 border-warning/30 hover:bg-warning/15' },
            { icon: Menu, label: 'Agent Hub', onClick: handleOpenMenu, color: 'text-foreground/70', bg: 'bg-card border-border/40 hover:bg-muted/40' },
          ].map((action, i) => (
            <button
              key={action.label}
              onClick={() => { hapticTap(); action.onClick(); }}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border transition-all touch-manipulation active:scale-95",
                action.bg
              )}
              style={staggerDelay(i, 40)}
            >
              <action.icon className={cn("h-5 w-5", action.color)} />
              <span className={cn("text-[11px] font-semibold", action.color)}>{action.label}</span>
            </button>
          ))}
        </div>

        {/* Credit Access — toggles on Credit button */}
        <AnimatePresence>
          {creditOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CreditAccessCard userId={user.id} compact />
            </motion.div>
          )}
        </AnimatePresence>

        <RecentAutoCharges />

        </main>
      </PullToRefresh>

      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />
      
      <AgentMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onRegisterUser={handleRegisterUser}
        onDeposit={handleDeposit}
        onPostRentRequest={() => setRentRequestOpen(true)}
        onInviteSubAgent={handleInviteSubAgent}
        onOpenEarningsRank={() => setEarningsRankOpen(true)}
        onManageProperty={() => { setMenuOpen(false); setManagedPropertyOpen(true); }}
        onViewManagedProperties={() => { setMenuOpen(false); setManagedPropertiesSheetOpen(true); }}
        onViewMyRentRequests={() => { setMenuOpen(false); setMyRentRequestsOpen(true); }}
        onTopUpTenant={() => { setMenuOpen(false); setTopUpTenantOpen(true); }}
        onViewTenants={() => { setMenuOpen(false); setTenantsSheetOpen(true); }}
        onInvestForPartner={() => { setMenuOpen(false); setInvestForPartnerOpen(true); }}
        onViewProxyHistory={() => { setMenuOpen(false); setProxyHistoryOpen(true); }}
        onIssueReceipt={() => { setMenuOpen(false); setReceiptOpen(true); }}
        onViewLandlordMap={() => { setMenuOpen(false); setLandlordMapOpen(true); }}
        onFindRentals={() => { setMenuOpen(false); setRentalFinderOpen(true); }}
        onListEmptyHouse={() => { setMenuOpen(false); setListHouseOpen(true); }}
        onViewMyListings={() => { setMenuOpen(false); setMyListingsOpen(true); }}
        onViewSubAgents={() => { setMenuOpen(false); setSubAgentsSheetOpen(true); }}
      />

      {/* Existing Dialogs */}
      <AgentDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <UnifiedRegistrationDialog 
        open={registerUserOpen} 
        onOpenChange={setRegisterUserOpen}
        onSuccess={() => { refreshOfflineData(); refreshEarnings(); }}
      />
      <RegisterSubAgentDialog
        open={inviteSubAgentOpen}
        onOpenChange={setInviteSubAgentOpen}
        onSuccess={() => { refreshOfflineData(); refreshEarnings(); }}
      />
      <AgentRentRequestDialog 
        open={rentRequestOpen} 
        onOpenChange={setRentRequestOpen} 
        onSuccess={() => setRentRequestOpen(false)}
      />
      <EarningsRankSystemSheet open={earningsRankOpen} onOpenChange={setEarningsRankOpen} />
      <AgentManagedPropertyDialog open={managedPropertyOpen} onOpenChange={setManagedPropertyOpen} onSuccess={refreshOfflineData} />
      <AgentManagedPropertiesSheet open={managedPropertiesSheetOpen} onOpenChange={setManagedPropertiesSheetOpen} onRequestPayout={(p) => { setPayoutProperty(p); setPayoutDialogOpen(true); }} />
      <AgentLandlordPayoutDialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen} property={payoutProperty} />
      <VerificationOpportunitiesButton />
      <CreditVerificationButton />
      <AgentMyRentRequestsSheet open={myRentRequestsOpen} onOpenChange={setMyRentRequestsOpen} />
      <AgentTenantsSheet open={tenantsSheetOpen} onOpenChange={setTenantsSheetOpen} />
      <AgentTopUpTenantDialog open={topUpTenantOpen} onOpenChange={setTopUpTenantOpen} onSuccess={refreshOfflineData} />
      <AgentInvestForPartnerDialog open={investForPartnerOpen} onOpenChange={setInvestForPartnerOpen} onSuccess={() => { refreshOfflineData(); refreshWallet(); }} />
      <ProxyInvestmentHistorySheet open={proxyHistoryOpen} onOpenChange={setProxyHistoryOpen} />
      <AgentReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} />
      <AgentLandlordMapSheet open={landlordMapOpen} onOpenChange={setLandlordMapOpen} />
      <RentalFinderSheet open={rentalFinderOpen} onOpenChange={setRentalFinderOpen} />
      <ListEmptyHouseDialog open={listHouseOpen} onOpenChange={setListHouseOpen} onSuccess={refreshOfflineData} />
      <AgentListingsSheet open={myListingsOpen} onOpenChange={setMyListingsOpen} />

      {/* Phase 1: Agent Operations Dialogs */}
      <AgentVisitPaymentWizard open={visitDialogOpen} onOpenChange={setVisitDialogOpen} onSuccess={refreshOfflineData} />
      <GeneratePaymentTokenDialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen} />
      <RecordAgentCollectionDialog open={recordCollectionOpen} onOpenChange={setRecordCollectionOpen} />
      <AgentDepositCashDialog open={depositCashOpen} onOpenChange={setDepositCashOpen} />
      <NearbyTenantsSheet open={nearbyTenantsOpen} onOpenChange={setNearbyTenantsOpen} />
      <MySubAgentsSheet open={subAgentsSheetOpen} onOpenChange={setSubAgentsSheetOpen} />
      <QuickShareSubAgentSheet open={shareLinkOpen} onOpenChange={setShareLinkOpen} />

      <MobileBottomNav currentRole={currentRole} onOpenMenu={handleOpenMenu} />
    </div>
  );
}
