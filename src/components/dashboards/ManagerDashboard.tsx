import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  FileText, 
  Banknote, 
  Receipt, 
  TrendingUp,
  ArrowRight,
  Sparkles,
  ShoppingCart,
  CheckCircle,
  Clock,
  ChartBar,
  Package,
  Award,
  Wallet,
  Download,
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
import { ManagerDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { FoodReceiptPromoCard } from '@/components/FoodReceiptPromoCard';
import { FoodShoppingLoansSection } from '@/components/loans/FoodShoppingLoansSection';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { FloatingDepositsWidget } from '@/components/manager/FloatingDepositsWidget';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import { CreateUserInviteDialog } from '@/components/manager/CreateUserInviteDialog';
import { SupporterInvitesList } from '@/components/manager/SupporterInvitesList';

interface ManagerDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

export default function ManagerDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: ManagerDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [createUserInviteOpen, setCreateUserInviteOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalFacilitated, setTotalFacilitated] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingLoans, setPendingLoans] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [requestsRes, usersRes, ordersRes, loansRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id, status, rent_amount'),
      supabase
        .from('profiles')
        .select('id'),
      supabase
        .from('product_orders')
        .select('id, status'),
      supabase
        .from('loan_applications')
        .select('id, status')
    ]);
    
    const requests = requestsRes.data || [];
    setPendingRequests(requests.filter(r => r.status === 'pending').length);
    setTotalFacilitated(
      requests
        .filter(r => ['funded', 'disbursed', 'completed'].includes(r.status))
        .reduce((sum, r) => sum + Number(r.rent_amount), 0)
    );
    setTotalUsers(usersRes.data?.length || 0);
    setPendingOrders((ordersRes.data || []).filter(o => ['pending', 'processing'].includes(o.status)).length);
    setPendingLoans((loansRes.data || []).filter(l => l.status === 'pending').length);
    
    setLoading(false);
  };

  if (loading) {
    return <ManagerDashboardSkeleton />;
  }

  const menuItems = [
    { icon: FileText, label: 'Rent Requests', onClick: () => navigate('/manager-access') },
    { icon: Banknote, label: 'Loan Applications', onClick: () => navigate('/manager-access?tab=loans') },
    { icon: ShoppingCart, label: 'Product Orders', onClick: () => navigate('/manager-access?tab=orders') },
    { icon: Users, label: 'User Management', onClick: () => navigate('/manager-access?tab=users'), separator: true },
    { icon: Receipt, label: 'Receipt Management', onClick: () => navigate('/manager-access?tab=receipts') },
    { icon: ChartBar, label: 'Financial Overview', onClick: () => navigate('/manager-access?tab=financials') },
    { icon: Wallet, label: 'Investment Accounts', onClick: () => navigate('/manager-access?tab=investments') },
    { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts'), separator: true },
    { icon: Banknote, label: 'My Loans', onClick: () => navigate('/my-loans') },
    { icon: Download, label: 'Share App', onClick: () => navigate('/install') },
  ];

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
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
              {profile?.full_name || 'Manager'}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              Platform Administrator
            </p>
          </div>
          {addRoleComponent}
        </button>

        {/* Wallet Card */}
        <WalletCard />

        {/* Platform Overview - Clickable */}
        <button 
          onClick={() => navigate('/manager-access')}
          className="w-full text-left block"
        >
          <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-success/5 hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/20 ring-2 ring-primary/30">
                    <ChartBar className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">Platform Overview</h3>
                      <Badge className="bg-primary/20 text-primary border-primary/30">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Tap to manage platform</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="p-3 rounded-xl bg-success/10 border border-success/20">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <span className="text-xs font-medium text-success">Facilitated</span>
                  </div>
                  <p className="text-lg font-bold">{formatUGX(totalFacilitated)}</p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-primary">Users</span>
                  </div>
                  <p className="text-lg font-bold">{totalUsers}</p>
                </div>
              </div>

              {/* Pending Items */}
              <div className="flex flex-wrap gap-2">
                {pendingRequests > 0 && (
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 gap-1">
                    <Clock className="h-3 w-3" />
                    {pendingRequests} Rent Requests
                  </Badge>
                )}
                {pendingLoans > 0 && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 gap-1">
                    <Banknote className="h-3 w-3" />
                    {pendingLoans} Loan Apps
                  </Badge>
                )}
                {pendingOrders > 0 && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1">
                    <Package className="h-3 w-3" />
                    {pendingOrders} Orders
                  </Badge>
                )}
                {pendingRequests === 0 && pendingLoans === 0 && pendingOrders === 0 && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1">
                    <CheckCircle className="h-3 w-3" />
                    All caught up!
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Prominent Create Receipts Button */}
        <button 
          onClick={() => navigate('/manager-access?tab=receipts')}
          className="w-full p-5 rounded-2xl bg-gradient-to-r from-success to-success/80 text-success-foreground hover:opacity-90 active:scale-[0.99] transition-all shadow-lg"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white/20">
                <Receipt className="h-7 w-7" />
              </div>
              <div className="text-left">
                <p className="font-bold text-lg">Create Receipt Codes</p>
                <p className="text-sm opacity-90">Generate & share with vendors</p>
              </div>
            </div>
            <ArrowRight className="h-6 w-6" />
          </div>
        </button>

        {/* Create User Invite Button */}
        <Button 
          onClick={() => setCreateUserInviteOpen(true)}
          className="w-full h-auto p-5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:opacity-90 shadow-lg"
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-white/20">
                <UserPlus className="h-7 w-7" />
              </div>
              <div className="text-left">
                <p className="font-bold text-lg">Sign Up New User</p>
                <p className="text-sm opacity-90">Create tenant, agent, or supporter</p>
              </div>
            </div>
            <ArrowRight className="h-6 w-6" />
          </div>
        </Button>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-3 gap-3">
          <button 
            onClick={() => navigate('/manager-access?tab=users')}
            className="p-4 rounded-xl bg-card border border-border/50 hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
          >
            <div className="p-2 rounded-lg bg-primary/10 w-fit mb-2">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <p className="font-semibold text-sm">Users</p>
            <p className="text-xs text-muted-foreground">{totalUsers}</p>
          </button>
          
          <button 
            onClick={() => navigate('/manager-access?tab=loans')}
            className="p-4 rounded-xl bg-card border border-border/50 hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
          >
            <div className="p-2 rounded-lg bg-warning/10 w-fit mb-2">
              <Banknote className="h-5 w-5 text-warning" />
            </div>
            <p className="font-semibold text-sm">Loans</p>
            <p className="text-xs text-muted-foreground">{pendingLoans} pending</p>
          </button>
          
          <button 
            onClick={() => navigate('/referrals')}
            className="p-4 rounded-xl bg-card border border-border/50 hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
          >
            <div className="p-2 rounded-lg bg-chart-5/10 w-fit mb-2">
              <Award className="h-5 w-5 text-chart-5" />
            </div>
            <p className="font-semibold text-sm">Rewards</p>
            <p className="text-xs text-muted-foreground">Leaderboard</p>
          </button>
        </div>

        {/* Supporter Invites List */}
        <SupporterInvitesList />

        {/* Food Receipt Promo */}
        <FoodReceiptPromoCard userId={user.id} />

        {/* Food Shopping Loans */}
        <FoodShoppingLoansSection />
      </main>

      {/* Floating Deposits Widget */}
      <FloatingDepositsWidget />
      
      <FloatingShareButton />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
      
      {/* Floating Action Button */}
      <FloatingActionButton 
        actions={[
          {
            icon: FileText,
            label: 'Rent Requests',
            onClick: () => navigate('/manager-access?tab=rent-requests'),
          },
          {
            icon: Banknote,
            label: 'Loan Applications',
            onClick: () => navigate('/manager-access?tab=loans'),
          },
          {
            icon: ShoppingCart,
            label: 'Orders',
            onClick: () => navigate('/manager-access?tab=orders'),
          },
          {
            icon: Users,
            label: 'Users',
            onClick: () => navigate('/manager-access?tab=users'),
          },
          {
            icon: Receipt,
            label: 'Receipts',
            onClick: () => navigate('/manager-access?tab=receipts'),
          },
        ]}
      />
      
      <CreateUserInviteDialog 
        open={createUserInviteOpen} 
        onOpenChange={setCreateUserInviteOpen} 
      />
    </div>
  );
}
