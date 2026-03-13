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
import { MyPropertiesSheet } from '@/components/landlord/MyPropertiesSheet';
import { useWallet } from '@/hooks/useWallet';
import { useLandlordStats } from '@/hooks/useLandlordStats';
import { formatUGX } from '@/lib/rentCalculations';
import { motion } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';
import { Skeleton } from '@/components/ui/skeleton';
import { CreditAccessCard } from '@/components/CreditAccessCard';

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
        <main className="px-5 py-6 space-y-6 animate-fade-in max-w-lg mx-auto">
          {/* Profile Section */}
          <div className="text-center space-y-2">
            <button onClick={() => navigate('/settings')} className="mx-auto block active:scale-95 transition-transform">
              <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
            </button>
            <div>
              <div className="flex items-center justify-center gap-2">
                <h1 className="font-bold text-xl flex items-center gap-1.5">
                  {profile?.full_name || 'Property Owner'}
                  {profile?.verified && (
                    <span className="flex items-center gap-0.5">
                      <BadgeCheck className="h-4 w-4 text-purple-500 fill-purple-500/20" />
                      <span className="text-[10px] text-purple-500 font-medium">Verified</span>
                    </span>
                  )}
                </h1>
                <WelileHomesLandlordBadge userId={user.id} variant="compact" />
              </div>
              <p className="text-xs text-muted-foreground">Property Owner</p>
            </div>
            
          </div>

          {/* Property Stats Row — large touch targets */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => { hapticTap(); setShowProperties(true); }}
              className="rounded-2xl bg-card border border-border/60 p-4 text-center shadow-sm hover:border-primary/40 transition-colors active:scale-95 min-h-[88px] flex flex-col items-center justify-center"
            >
              <Home className="h-5 w-5 text-primary mb-1" />
              {statsLoading ? (
                <Skeleton className="h-7 w-10 mx-auto mb-1" />
              ) : (
                <p className="text-2xl font-bold leading-tight">{landlordStats.totalProperties}</p>
              )}
              <p className="text-[11px] font-medium text-muted-foreground mt-0.5">Properties</p>
            </button>
            <div className="rounded-2xl bg-card border border-border/60 p-4 text-center shadow-sm min-h-[88px] flex flex-col items-center justify-center">
              <DoorOpen className="h-5 w-5 text-warning mb-1" />
              {statsLoading ? (
                <Skeleton className="h-7 w-10 mx-auto mb-1" />
              ) : (
                <p className="text-2xl font-bold leading-tight">{landlordStats.emptyHouses}</p>
              )}
              <p className="text-[11px] font-medium text-muted-foreground mt-0.5">Empty</p>
            </div>
            <div className="rounded-2xl bg-card border border-border/60 p-4 text-center shadow-sm min-h-[88px] flex flex-col items-center justify-center">
              <Banknote className="h-5 w-5 text-success mb-1" />
              {statsLoading ? (
                <Skeleton className="h-7 w-8 mx-auto mb-1" />
              ) : (
                <p className="text-base font-bold leading-tight">{formatUGX(landlordStats.totalRentReceivable)}</p>
              )}
              <p className="text-[11px] font-medium text-muted-foreground mt-0.5">Rent/Month</p>
            </div>
          </div>

          {/* Credit Access Limit — based on rent collected */}
          <CreditAccessCard userId={user.id} />

          {/* THREE MAIN ACTION BUTTONS — tall, finger-friendly */}
          <div className="space-y-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleViewWallet}
              className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-success/10 to-emerald-500/10 border-2 border-success/30 hover:border-success/50 transition-all touch-manipulation min-h-[72px]"
            >
              <div className="p-3 rounded-xl bg-success/20 shrink-0">
                <Wallet className="h-7 w-7 text-success" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-bold text-xl text-success truncate">{formatUGX(wallet?.balance ?? 0)}</p>
                <p className="text-sm text-muted-foreground">Wallet Balance</p>
              </div>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleOpenRegisterProperty}
              className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-primary/10 to-blue-500/10 border-2 border-primary/30 hover:border-primary/50 transition-all touch-manipulation min-h-[72px]"
            >
              <div className="p-3 rounded-xl bg-primary/20 shrink-0">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-bold text-lg">Guaranteed Monthly Rent</p>
                <p className="text-sm text-muted-foreground">Register property to start earning</p>
              </div>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleOpenMenu}
              className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-muted/50 to-muted/30 border-2 border-border hover:border-primary/30 transition-all touch-manipulation min-h-[72px]"
            >
              <div className="p-3 rounded-xl bg-muted shrink-0">
                <Menu className="h-7 w-7 text-foreground" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-bold text-lg">Menu</p>
                <p className="text-sm text-muted-foreground">Tenants, receipts, loans & more</p>
              </div>
            </motion.button>
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
      <MobileBottomNav currentRole={currentRole} />
    </div>
  );
}
