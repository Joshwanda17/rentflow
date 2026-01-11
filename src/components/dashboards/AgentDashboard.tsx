import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  ArrowRight,
  Package,
  Download,
  Building2,
  UserPlus
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
import { CreateUserInviteDialog } from '@/components/agent/CreateUserInviteDialog';
import { AgentInvitesList } from '@/components/agent/AgentInvitesList';
import { AgentGoalProgress } from '@/components/agent/AgentGoalProgress';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { AgentDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FoodReceiptPromoCard } from '@/components/FoodReceiptPromoCard';
import { FoodShoppingLoansSection } from '@/components/loans/FoodShoppingLoansSection';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import { CollapsibleQuickNav } from '@/components/CollapsibleQuickNav';

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
  const { totalEarnings } = useAgentEarnings();
  const [referralCount, setReferralCount] = useState(0);
  const [tenantsCount, setTenantsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [registerUserOpen, setRegisterUserOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [requestsRes, referralsRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id')
        .eq('agent_id', user.id),
      supabase
        .from('referrals')
        .select('id')
        .eq('referrer_id', user.id)
    ]);
    
    setTenantsCount(requestsRes.data?.length || 0);
    setReferralCount(referralsRes.data?.length || 0);
    setLoading(false);
  };

  if (loading) {
    return <AgentDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await fetchData();
  };

  const menuItems = [
    { icon: ArrowDownCircle, label: 'Deposit for User', onClick: () => setDepositOpen(true) },
    { icon: ArrowUpCircle, label: 'Withdraw for User', onClick: () => setWithdrawalOpen(true) },
    { icon: UserPlus, label: 'Register User', onClick: () => setRegisterUserOpen(true), separator: true },
    { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts') },
    { icon: Banknote, label: 'My Loans', onClick: () => navigate('/my-loans') },
    { icon: Store, label: 'My Shop', onClick: () => navigate('/marketplace') },
    { icon: TrendingUp, label: 'Earnings', onClick: () => navigate('/earnings'), separator: true },
    { icon: History, label: 'Transactions', onClick: () => navigate('/transactions') },
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
              {profile?.full_name || 'Agent'}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              Tap to view profile
            </p>
          </div>
          {addRoleComponent}
        </button>

        {/* Wallet Card */}
        <WalletCard />

        {/* Collapsible Quick Navigation */}
        <CollapsibleQuickNav 
          buttonLabel="Quick Actions"
          items={[
            { icon: ArrowDownCircle, label: 'Deposit', onClick: () => setDepositOpen(true), variant: 'success' },
            { icon: ArrowUpCircle, label: 'Withdraw', onClick: () => setWithdrawalOpen(true), variant: 'warning' },
            { icon: UserPlus, label: 'Add User', onClick: () => setRegisterUserOpen(true), variant: 'primary' },
            { icon: Store, label: 'My Shop', onClick: () => navigate('/marketplace'), variant: 'primary' },
            { icon: Receipt, label: 'Receipts', onClick: () => navigate('/my-receipts') },
            { icon: Banknote, label: 'Loans', onClick: () => navigate('/my-loans') },
            { icon: TrendingUp, label: 'Earnings', onClick: () => navigate('/earnings'), variant: 'success' },
            { icon: Users, label: 'Referrals', onClick: () => navigate('/referrals') },
          ]}
        />

        {/* Monthly Goal Progress */}
        <AgentGoalProgress />

        {/* Earnings Card - Clickable */}
        <button 
          onClick={() => navigate('/earnings')}
          className="w-full text-left block"
        >
          <Card className="border-2 border-success/30 bg-gradient-to-br from-success/5 via-background to-warning/5 hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-success/20 ring-2 ring-success/30">
                    <Coins className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Your Earnings</h3>
                    <p className="text-sm text-muted-foreground">Tap to view details</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-success/10 border border-success/20 text-center">
                  <p className="text-xl font-bold text-success">{formatUGX(totalEarnings)}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-lg font-bold">{tenantsCount}</p>
                  <p className="text-xs text-muted-foreground">Tenants</p>
                </div>
                <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-center">
                  <p className="text-lg font-bold">{referralCount}</p>
                  <p className="text-xs text-muted-foreground">Referrals</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* My Shop Card - Clickable */}
        <button 
          onClick={() => navigate('/marketplace')}
          className="w-full text-left block"
        >
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-success/5 hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/20 ring-2 ring-primary/30">
                    <Store className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">My Shop</h3>
                      <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
                        <Package className="h-3 w-3" />
                        Manage
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Tap to manage products & orders</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Food Receipt Promo */}
        <FoodReceiptPromoCard userId={user.id} />

        {/* Registered Users List */}
        <AgentInvitesList />

        {/* Food Shopping Loans */}
        <FoodShoppingLoansSection />
      </main>
      
      {/* FAB for quick deposit */}
      <button 
        type="button"
        onClick={() => setDepositOpen(true)}
        className="wa-fab"
        aria-label="Deposit for User"
      >
        <ArrowDownCircle className="h-6 w-6 pointer-events-none" />
      </button>
      
      <AgentDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <AgentWithdrawalDialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen} />
      <CreateUserInviteDialog open={registerUserOpen} onOpenChange={setRegisterUserOpen} />
      
      <FloatingShareButton />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
