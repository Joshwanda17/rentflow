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
} from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { PullToRefresh } from '@/components/PullToRefresh';
import { WelileHomesLandlordBadge } from '@/components/landlord/WelileHomesLandlordBadge';
import { LandlordMenuDrawer } from '@/components/landlord/LandlordMenuDrawer';
import RegisterPropertyDialog from '@/components/landlord/RegisterPropertyDialog';
import LandlordAddTenantDialog from '@/components/landlord/LandlordAddTenantDialog';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { MyPropertiesSheet } from '@/components/landlord/MyPropertiesSheet';
import { useWallet } from '@/hooks/useWallet';
import { useLandlordStats } from '@/hooks/useLandlordStats';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { Skeleton } from '@/components/ui/skeleton';

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
        <main className="px-4 py-6 space-y-8 animate-fade-in max-w-lg mx-auto">
          {/* Profile Section - Centered like Agent Dashboard */}
          <div className="text-center space-y-3">
            <button onClick={() => navigate('/settings')} className="mx-auto block">
              <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
            </button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <h1 className="font-bold text-2xl">
                  {profile?.full_name || 'Property Owner'}
                </h1>
                <WelileHomesLandlordBadge userId={user.id} variant="compact" />
              </div>
              <p className="text-sm text-muted-foreground">Property Owner</p>
            </div>
          </div>

          {/* Property Stats Row */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => { hapticTap(); setShowProperties(true); }}
              className="rounded-xl bg-card border border-border/60 p-3 text-center shadow-sm hover:border-primary/40 transition-colors active:scale-95"
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Home className="h-4 w-4 text-primary" />
              </div>
              {statsLoading ? (
                <Skeleton className="h-6 w-10 mx-auto mb-1" />
              ) : (
                <p className="text-xl font-bold">{landlordStats.totalProperties}</p>
              )}
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Properties</p>
            </button>
            <div className="rounded-xl bg-card border border-border/60 p-3 text-center shadow-sm">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <DoorOpen className="h-4 w-4 text-warning" />
              </div>
              {statsLoading ? (
                <Skeleton className="h-6 w-10 mx-auto mb-1" />
              ) : (
                <p className="text-xl font-bold">{landlordStats.emptyHouses}</p>
              )}
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Empty</p>
            </div>
            <div className="rounded-xl bg-card border border-border/60 p-3 text-center shadow-sm">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Banknote className="h-4 w-4 text-success" />
              </div>
              {statsLoading ? (
                <Skeleton className="h-6 w-8 mx-auto mb-1" />
              ) : (
                <p className="text-lg font-bold">{formatUGX(landlordStats.totalRentReceivable)}</p>
              )}
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Rent/Month</p>
            </div>
          </div>

          {/* THREE MAIN ACTION BUTTONS */}
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

            {/* 2. GUARANTEED MONTHLY RENT - Register Property */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleOpenRegisterProperty}
              className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-primary/10 to-blue-500/10 border-2 border-primary/30 hover:border-primary/50 transition-all touch-manipulation"
            >
              <div className="p-3 rounded-xl bg-primary/20">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-lg">Guaranteed Monthly Rent</p>
                <p className="text-sm text-muted-foreground">Register property to start earning</p>
              </div>
            </motion.button>

            {/* 3. MENU BUTTON */}
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
                <p className="text-sm text-muted-foreground">Tenants, receipts, loans & more</p>
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

      {/* Properties sheet */}
      <MyPropertiesSheet open={showProperties} onOpenChange={setShowProperties} userId={user.id} />

      {/* Menu Drawer */}
      <LandlordMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onAddTenant={() => setAddTenantOpen(true)}
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

      {/* Fixed footer navigation */}
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </div>
  );
}
