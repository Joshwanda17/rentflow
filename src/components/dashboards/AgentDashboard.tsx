import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';

import AiIdButton from '@/components/ai-id/AiIdButton';
import { Button } from '@/components/ui/button';
import { 
  UserPlus,
  Wallet,
  Menu,
  WifiOff,
  RefreshCw,
  BadgeCheck,
  MapPin,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
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
import { useOffline } from '@/contexts/OfflineContext';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useOfflineAgentDashboard } from '@/hooks/useOfflineAgentDashboard';
import { useWallet } from '@/hooks/useWallet';
import { EarningsRankSystemSheet } from '@/components/agent/EarningsRankSystemSheet';
import { AgentMenuDrawer } from '@/components/agent/AgentMenuDrawer';
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
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { CreditAccessCard } from '@/components/CreditAccessCard';
import { ApprovedRentRequestsWidget } from '@/components/rent/ApprovedRentRequestsWidget';
import { RecentAutoCharges } from '@/components/wallet/RecentAutoCharges';

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
  const [applyingToSell, setApplyingToSell] = useState(false);

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
        <main className="px-4 py-6 space-y-6 animate-fade-in max-w-lg mx-auto">
        {/* Offline Notice */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Card className="border-warning/50 bg-warning/10">
                <CardContent className="p-3 flex items-center gap-3">
                  <WifiOff className="h-4 w-4 text-warning shrink-0" />
                  <p className="text-sm flex-1">Offline mode</p>
                  <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AgentAgreementBanner />

        {/* Profile Section */}
        <div className="text-center space-y-3">
          <button onClick={() => navigate('/settings')} className="mx-auto block">
            <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
          </button>
          <div>
            <h1 className="font-bold text-2xl flex items-center justify-center gap-1.5">
              {profile?.full_name || 'Agent'}
              {profile?.verified && (
                <span className="flex items-center gap-0.5">
                  <BadgeCheck className="h-5 w-5 text-purple-500 fill-purple-500/20" />
                  <span className="text-[10px] text-purple-500 font-medium">Verified</span>
                </span>
              )}
              {profile?.is_seller && (
                <span className="flex items-center gap-0.5 ml-1">
                  <ShoppingBag className="h-4 w-4 text-chart-4" />
                  <span className="text-[10px] text-chart-4 font-semibold">Seller</span>
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">Welile Agent</p>
            {/* Compact Sell CTA or Pending notice */}
            {!profile?.is_seller && profile?.seller_application_status !== 'pending' && (
              <button
                onClick={() => { hapticTap(); handleApplyToSell(); }}
                disabled={applyingToSell}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-chart-4/40 bg-chart-4/10 text-chart-4 text-xs font-semibold hover:bg-chart-4/20 transition-all touch-manipulation"
              >
                <ShoppingBag className="h-3 w-3" />
                {applyingToSell ? 'Applying…' : 'Start Selling on Welile'}
              </button>
            )}
            {!profile?.is_seller && profile?.seller_application_status === 'pending' && (
              <span className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning/10 text-warning text-xs font-medium">
                <ShoppingBag className="h-3 w-3" />
                Seller Application Pending
              </span>
            )}
          </div>
          <AiIdButton variant="compact" />
        </div>

        {/* Wallet Button — Priority 1 */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleViewWallet}
          className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-success/10 to-emerald-500/10 border-2 border-success/30 hover:border-success/50 transition-all touch-manipulation overflow-hidden"
        >
          <div className="p-3 rounded-xl bg-success/20 shrink-0">
            <Wallet className="h-7 w-7 text-success" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="font-bold text-xl text-success truncate">{formatUGX(wallet?.balance ?? 0)}</p>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">Rent Money</span>
              {profile?.phone && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  {/^(\+?256)?0?(77|78|76)/.test(profile.phone) && (
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(48,100%,50%)] text-[7px] font-black text-[hsl(220,20%,20%)] leading-none">M</span>
                  )}
                  {/^(\+?256)?0?(75|70|74)/.test(profile.phone) && (
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(0,85%,50%)] text-[7px] font-black text-white leading-none">A</span>
                  )}
                  <span className="text-xs text-muted-foreground">{profile.phone}</span>
                </>
              )}
            </div>
            <RecentAutoCharges />
          </div>
        </motion.button>
        <WalletDisclaimer />

        {/* Visit Tenant Card — Priority 2 */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { hapticTap(); setVisitDialogOpen(true); }}
          className="w-full flex items-center gap-4 p-5 rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all touch-manipulation"
          style={{ boxShadow: '0 1px 3px 0 hsl(var(--primary) / 0.08)' }}
        >
          <div className="p-3 rounded-xl bg-primary/10 shrink-0">
            <MapPin className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-lg text-foreground">Visit Tenant</p>
            <p className="text-xs text-muted-foreground">Check in, collect payment & send SMS receipt</p>
          </div>
        </motion.button>

        {/* Daily Ops Report — Priority 3 */}
        <AgentDailyOpsCard />

        {/* Menu Button */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleOpenMenu}
          className="w-full flex items-center gap-4 p-4 rounded-2xl bg-muted/30 border border-border hover:border-primary/30 transition-all touch-manipulation"
        >
          <div className="p-2.5 rounded-xl bg-muted">
            <Menu className="h-6 w-6 text-foreground" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold">All Features & Tools</p>
            <p className="text-xs text-muted-foreground">Registrations, earnings, shop & more</p>
          </div>
        </motion.button>

        {/* Credit Access */}
        <CreditAccessCard userId={user.id} compact />

        <ApprovedRentRequestsWidget mode="agent" />


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

      <MobileBottomNav currentRole={currentRole} onOpenMenu={handleOpenMenu} />
    </div>
  );
}
