import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { useOffline } from '@/contexts/OfflineContext';
import { 
  Wallet, 
  Building2, 
  Menu,
  ArrowRight,
} from 'lucide-react';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import { WalletCard } from '@/components/wallet/WalletCard';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import MobileQuickMenu from '@/components/MobileQuickMenu';
import { WelileHomesLandlordBadge } from '@/components/landlord/WelileHomesLandlordBadge';
import { LandlordMenuDrawer } from '@/components/landlord/LandlordMenuDrawer';
import RegisterPropertyDialog from '@/components/landlord/RegisterPropertyDialog';
import LandlordAddTenantDialog from '@/components/landlord/LandlordAddTenantDialog';
import { motion } from 'framer-motion';
import { hapticTap } from '@/lib/haptics';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [registerPropertyOpen, setRegisterPropertyOpen] = useState(false);
  const [addTenantOpen, setAddTenantOpen] = useState(false);

  const handleRefresh = async () => {
    // Wallet card handles its own refresh via PullToRefresh
  };

  const handleOpenMenu = () => {
    hapticTap();
    setMenuOpen(true);
  };

  const handleOpenRegisterProperty = () => {
    hapticTap();
    setRegisterPropertyOpen(true);
  };

  const menuItems = [
    { icon: Building2, label: 'Register Property', onClick: () => setRegisterPropertyOpen(true) },
    { icon: Menu, label: 'All Features', onClick: () => setMenuOpen(true) },
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

      <main className="px-4 py-4 space-y-3 animate-fade-in">
        {/* Profile Section - Minimal */}
        <button 
          onClick={() => navigate('/settings')}
          className="w-full wa-list-item rounded-xl border border-border/50 shadow-sm hover:bg-muted/50 active:scale-[0.99] transition-all"
        >
          <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="md" />
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-base truncate">
                {profile?.full_name || 'Landlord'}
              </h2>
              <WelileHomesLandlordBadge userId={user.id} variant="compact" />
            </div>
            <p className="text-sm text-muted-foreground truncate">
              Tap to view profile
            </p>
          </div>
          {addRoleComponent}
        </button>

        {/* Priority Card 1: Wallet */}
        <WalletCard />

        {/* Priority Card 2: Guaranteed Monthly Rent */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleOpenRegisterProperty}
          className="w-full text-left p-5 rounded-2xl bg-gradient-to-br from-success/10 via-background to-primary/10 border-2 border-success/30 hover:shadow-lg transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-success/20 ring-2 ring-success/30 shrink-0">
              <Building2 className="h-7 w-7 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg text-foreground">Guaranteed Monthly Rent</p>
              <p className="text-sm text-muted-foreground">Register property to start earning</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        </motion.button>

        {/* Menu Card */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleOpenMenu}
          className="w-full text-left p-5 rounded-2xl bg-muted/50 border-2 border-border hover:bg-muted/70 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-muted shrink-0">
              <Menu className="h-7 w-7 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-lg text-foreground">Menu</p>
              <p className="text-sm text-muted-foreground">Tenants, receipts, loans & more</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        </motion.button>
      </main>
      
      <FloatingShareButton />
      <MobileQuickMenu currentRole={currentRole} />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />

      {/* Dialogs */}
      <LandlordMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onAddTenant={() => setAddTenantOpen(true)}
      />
      <RegisterPropertyDialog
        open={registerPropertyOpen}
        onOpenChange={setRegisterPropertyOpen}
      />
      <LandlordAddTenantDialog
        open={addTenantOpen}
        onOpenChange={setAddTenantOpen}
      />
    </PullToRefresh>
  );
}
