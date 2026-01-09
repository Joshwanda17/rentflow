import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Banknote, 
  Building, 
  Receipt, 
  History, 
  Share2,
  ArrowRight,
  TrendingUp,
  Users,
  Download
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import { WalletCard } from '@/components/wallet/WalletCard';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { LandlordDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FoodReceiptPromoCard } from '@/components/FoodReceiptPromoCard';
import { FoodShoppingLoansSection } from '@/components/loans/FoodShoppingLoansSection';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import { QuickNavGrid } from '@/components/QuickNavGrid';

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
  const [totalReceived, setTotalReceived] = useState(0);
  const [paymentsCount, setPaymentsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const { data } = await supabase
      .from('platform_transactions')
      .select('id, amount')
      .eq('user_id', user.id)
      .eq('transaction_type', 'landlord_payout');
    
    const payments = data || [];
    setPaymentsCount(payments.length);
    setTotalReceived(payments.reduce((sum, p) => sum + Number(p.amount), 0));
    setLoading(false);
  };

  if (loading) {
    return <LandlordDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await fetchData();
  };

  const menuItems = [
    { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts') },
    { icon: Banknote, label: 'My Loans', onClick: () => navigate('/my-loans') },
    { icon: History, label: 'Payment History', onClick: () => navigate('/transactions'), separator: true },
    { icon: Users, label: 'Referrals', onClick: () => navigate('/referrals') },
    { icon: Share2, label: 'Share & Earn', onClick: () => navigate('/benefits') },
    { icon: Download, label: 'Share App', onClick: () => navigate('/install') },
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

      <main className="px-4 py-4 space-y-4 animate-fade-in">
        {/* User Profile Card - Clickable */}
        <button 
          onClick={() => navigate('/settings')}
          className="w-full wa-list-item rounded-xl border border-border/50 shadow-sm hover:bg-muted/50 active:scale-[0.99] transition-all"
        >
          <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="md" />
          <div className="flex-1 min-w-0 text-left">
            <h2 className="font-semibold text-base truncate">
              {profile?.full_name || 'Landlord'}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              Tap to view profile
            </p>
          </div>
          {addRoleComponent}
        </button>

        {/* Wallet Card */}
        <WalletCard />

        {/* Quick Navigation Grid */}
        <QuickNavGrid 
          title="Quick Actions"
          items={[
            { icon: Receipt, label: 'Receipts', onClick: () => navigate('/my-receipts'), variant: 'primary' },
            { icon: Banknote, label: 'My Loans', onClick: () => navigate('/my-loans') },
            { icon: History, label: 'Payments', onClick: () => navigate('/transactions'), variant: 'success' },
            { icon: Users, label: 'Referrals', onClick: () => navigate('/referrals') },
            { icon: Share2, label: 'Earn', onClick: () => navigate('/benefits'), variant: 'warning' },
            { icon: Download, label: 'Share App', onClick: () => navigate('/install') },
          ]}
        />

        {/* Rent Income Card - Clickable */}
        <button 
          onClick={() => navigate('/transactions')}
          className="w-full text-left block"
        >
          <Card className="border-2 border-success/30 bg-gradient-to-br from-success/5 via-background to-primary/5 hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-success/20 ring-2 ring-success/30">
                    <Building className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Rent Income</h3>
                    <p className="text-sm text-muted-foreground">Tap to view history</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-success/10 border border-success/20">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <span className="text-xs font-medium text-success">Total Received</span>
                  </div>
                  <p className="text-xl font-bold">{formatUGX(totalReceived)}</p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Banknote className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-primary">Payments</span>
                  </div>
                  <p className="text-xl font-bold">{paymentsCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Food Receipt Promo */}
        <FoodReceiptPromoCard userId={user.id} />

        {/* Food Shopping Loans */}
        <FoodShoppingLoansSection />
      </main>
      
      <FloatingShareButton />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
