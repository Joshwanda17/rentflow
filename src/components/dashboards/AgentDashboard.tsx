import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  UserPlus,
  Wallet,
  Menu,
  WifiOff,
  RefreshCw,
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
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';

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

  // Real-time subscription for referrals
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    
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
        () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            refreshOfflineData();
            refreshEarnings();
            refreshWallet();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user.id, refreshEarnings, refreshWallet, refreshOfflineData]);

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

  // Minimal menu for header
  const menuItems = [
    { icon: UserPlus, label: 'Register User', onClick: handleRegisterUser },
  ];

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

      {/* Scrollable content area with bottom padding for fixed footer */}
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto pb-28 md:pb-4">
        <main className="px-4 py-6 space-y-8 animate-fade-in max-w-lg mx-auto">
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

        {/* Agent Agreement Banner */}
        <AgentAgreementBanner />

        {/* Profile Section - Minimal */}
        <div className="text-center space-y-3">
          <button onClick={() => navigate('/settings')} className="mx-auto block">
            <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
          </button>
          <div>
            <h1 className="font-bold text-2xl">
              {profile?.full_name || 'Agent'}
            </h1>
            <p className="text-sm text-muted-foreground">Welile Agent</p>
          </div>
          
          {/* Quick Stats */}
          <div className="flex justify-center gap-6 text-center">
            <div>
              <p className="font-bold text-lg">{tenantsCount + referralCount}</p>
              <p className="text-xs text-muted-foreground">Users</p>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="font-bold text-lg">{subAgentCount}</p>
              <p className="text-xs text-muted-foreground">Sub-Agents</p>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            THREE MAIN ACTION BUTTONS
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          {/* 1. WALLET BUTTON - Primary */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleViewWallet}
            className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-success/10 to-emerald-500/10 border-2 border-success/30 hover:border-success/50 transition-all touch-manipulation"
          >
            <div className="p-3 rounded-xl bg-success/20">
              <Wallet className="h-7 w-7 text-success" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-xl text-success">{formatUGX(wallet?.balance ?? 0)}</p>
              <p className="text-sm text-muted-foreground">Wallet Balance</p>
            </div>
          </motion.button>

          {/* 2. REGISTER USER BUTTON */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleRegisterUser}
            className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-primary/10 to-blue-500/10 border-2 border-primary/30 hover:border-primary/50 transition-all touch-manipulation"
          >
            <div className="p-3 rounded-xl bg-primary/20">
              <UserPlus className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-lg">Register New User</p>
              <p className="text-sm text-muted-foreground">Onboard tenants, landlords & more</p>
            </div>
          </motion.button>

          {/* 3. MENU BUTTON - Just below Register */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleOpenMenu}
            className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-muted/50 to-muted/30 border-2 border-border hover:border-primary/30 transition-all touch-manipulation"
          >
            <div className="p-3 rounded-xl bg-muted">
              <Menu className="h-7 w-7 text-foreground" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-lg">Menu</p>
              <p className="text-sm text-muted-foreground">All agent features & tools</p>
            </div>
          </motion.button>
        </div>

        {/* ADD ROLE COMPONENT */}
        <div className="flex justify-center">
          {addRoleComponent}
        </div>

        </main>
      </PullToRefresh>

      {/* Full-screen wallet sheet */}
      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />
      
      {/* Menu Drawer */}
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
      />

      {/* Dialogs */}
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
      <EarningsRankSystemSheet
        open={earningsRankOpen}
        onOpenChange={setEarningsRankOpen}
      />
      <AgentManagedPropertyDialog
        open={managedPropertyOpen}
        onOpenChange={setManagedPropertyOpen}
        onSuccess={refreshOfflineData}
      />
      <AgentManagedPropertiesSheet
        open={managedPropertiesSheetOpen}
        onOpenChange={setManagedPropertiesSheetOpen}
        onRequestPayout={(p) => { setPayoutProperty(p); setPayoutDialogOpen(true); }}
      />
      <AgentLandlordPayoutDialog
        open={payoutDialogOpen}
        onOpenChange={setPayoutDialogOpen}
        property={payoutProperty}
      />
      
      {/* Verification opportunities FAB */}
      <VerificationOpportunitiesButton />
      
      {/* Fixed footer navigation */}
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </div>
  );
}
