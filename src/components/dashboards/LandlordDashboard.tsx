import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { 
  Wallet, 
  Building2, 
  Menu,
  Home,
  DoorOpen,
  Banknote,
  BadgeCheck,
} from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import AiIdButton from '@/components/ai-id/AiIdButton';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { PullToRefresh } from '@/components/PullToRefresh';
import { WelileHomesLandlordBadge } from '@/components/landlord/WelileHomesLandlordBadge';
import { LandlordMenuDrawer } from '@/components/landlord/LandlordMenuDrawer';
import RegisterPropertyDialog from '@/components/landlord/RegisterPropertyDialog';
import LandlordAddTenantDialog from '@/components/landlord/LandlordAddTenantDialog';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { WalletDisclaimer } from '@/components/wallet/WalletDisclaimer';
import { MyPropertiesSheet } from '@/components/landlord/MyPropertiesSheet';
import { AvailableHousesSheet } from '@/components/tenant/AvailableHousesSheet';
import { useWallet } from '@/hooks/useWallet';
import { useLandlordStats } from '@/hooks/useLandlordStats';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditAccessCard } from '@/components/CreditAccessCard';
import { InviteAndEarnCard } from '@/components/shared/InviteAndEarnCard';

interface LandlordDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

export default function LandlordDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: LandlordDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { wallet, refreshWallet } = useWallet();
  const { stats: landlordStats, loading: statsLoading, refreshStats } = useLandlordStats(user.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [registerPropertyOpen, setRegisterPropertyOpen] = useState(false);
  const [addTenantOpen, setAddTenantOpen] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [showListedHouses, setShowListedHouses] = useState(false);

  const handleRefresh = async () => {
    await Promise.all([refreshWallet(), refreshStats()]);
  };

  const handleViewWallet = () => { hapticTap(); setShowWallet(true); };
  const handleOpenRegisterProperty = () => { hapticTap(); setRegisterPropertyOpen(true); };
  const handleOpenMenu = () => { hapticTap(); setMenuOpen(true); };

  const menuItems = [
    { icon: Building2, label: 'Register Property', onClick: () => setRegisterPropertyOpen(true) },
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
        <main className="px-4 py-5 space-y-5 animate-fade-in max-w-lg mx-auto">

          {/* Profile + Wallet Hero Card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border/60 bg-card overflow-hidden"
          >
            {/* Profile row */}
            <div className="flex items-center gap-3 p-4 pb-3">
              <button onClick={() => navigate('/settings')} className="shrink-0">
                <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="md" />
              </button>
              <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium">Welcome back</p>
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-lg leading-tight truncate">{profile?.full_name || 'Property Owner'}</h1>
                  {profile?.verified && (
                    <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 shrink-0" />
                  )}
                  <WelileHomesLandlordBadge userId={user.id} variant="compact" />
                </div>
                <p className="text-xs text-muted-foreground">Property Owner</p>
              </div>
              <AiIdButton variant="compact" />
            </div>

            {/* Wallet strip */}
            <button
              onClick={handleViewWallet}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 border-t border-border/40 hover:bg-muted/50 transition-colors touch-manipulation"
            >
              <Wallet className="h-5 w-5 text-success shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <p className="font-bold text-lg text-foreground truncate">{formatUGX(wallet?.balance ?? 0)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {profile?.phone && (
                  <>
                    {/^(\+?256)?0?(77|78|76)/.test(profile.phone) && (
                      <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(48,100%,50%)] text-[6px] font-black text-[hsl(220,20%,20%)] leading-none">M</span>
                    )}
                    {/^(\+?256)?0?(75|70|74)/.test(profile.phone) && (
                      <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(0,85%,50%)] text-[6px] font-black text-white leading-none">A</span>
                    )}
                  </>
                )}
                <span className="text-xs text-muted-foreground">→</span>
              </div>
            </button>
          </motion.div>

          {/* Property Stats Row */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { hapticTap(); setShowProperties(true); }}
              className="rounded-xl bg-card border border-border/50 p-3 text-center hover:bg-muted/40 transition-colors active:scale-95 touch-manipulation"
            >
              <Home className="h-4 w-4 text-primary mx-auto mb-1" />
              {statsLoading ? (
                <Skeleton className="h-6 w-8 mx-auto mb-0.5" />
              ) : (
                <p className="text-xl font-bold leading-tight">{landlordStats.totalProperties}</p>
              )}
              <p className="text-[10px] font-medium text-muted-foreground">Properties</p>
            </button>
            <div className="rounded-xl bg-card border border-border/50 p-3 text-center">
              <DoorOpen className="h-4 w-4 text-warning mx-auto mb-1" />
              {statsLoading ? (
                <Skeleton className="h-6 w-8 mx-auto mb-0.5" />
              ) : (
                <p className="text-xl font-bold leading-tight">{landlordStats.emptyHouses}</p>
              )}
              <p className="text-[10px] font-medium text-muted-foreground">Empty</p>
            </div>
            <div className="rounded-xl bg-card border border-border/50 p-3 text-center">
              <Banknote className="h-4 w-4 text-success mx-auto mb-1" />
              {statsLoading ? (
                <Skeleton className="h-6 w-6 mx-auto mb-0.5" />
              ) : (
                <p className="text-sm font-bold leading-tight">{formatUGX(landlordStats.totalRentReceivable)}</p>
              )}
              <p className="text-[10px] font-medium text-muted-foreground">Rent/Month</p>
            </div>
          </div>

          {/* Credit Access */}
          <CreditAccessCard userId={user.id} />

          {/* Action Buttons — Clean & Minimal */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Actions</p>

            <button
              onClick={handleOpenRegisterProperty}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors touch-manipulation"
            >
              <Building2 className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <p className="font-medium text-sm">Register Property</p>
                <p className="text-xs text-muted-foreground">Start earning guaranteed monthly rent</p>
              </div>
              <span className="text-xs text-muted-foreground">→</span>
            </button>

            <button
              onClick={handleOpenMenu}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors touch-manipulation"
            >
              <Menu className="h-5 w-5 text-foreground/70 shrink-0" />
              <div className="flex-1 text-left">
                <p className="font-medium text-sm">Menu</p>
                <p className="text-xs text-muted-foreground">Tenants, receipts, loans & more</p>
              </div>
              <span className="text-xs text-muted-foreground">→</span>
            </button>
          </div>

          {/* Invite & Earn */}
          <InviteAndEarnCard variant="landlord" />

          <WalletDisclaimer />
        </main>
      </PullToRefresh>

      {/* Full-screen wallet sheet */}
      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />

      {/* Properties sheet */}
      <MyPropertiesSheet open={showProperties} onOpenChange={setShowProperties} userId={user.id} />

      {/* Menu Drawer */}
      <LandlordMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onAddTenant={() => setAddTenantOpen(true)}
        onViewListedHouses={() => { setMenuOpen(false); setShowListedHouses(true); }}
      />

      {/* Dialogs */}
      <RegisterPropertyDialog
        open={registerPropertyOpen}
        onOpenChange={setRegisterPropertyOpen}
      />
      <LandlordAddTenantDialog
        open={addTenantOpen}
        onOpenChange={setAddTenantOpen}
      />
      <AvailableHousesSheet open={showListedHouses} onOpenChange={setShowListedHouses} />

      {/* Fixed footer navigation */}
      <MobileBottomNav currentRole={currentRole} />
    </div>
  );
}
