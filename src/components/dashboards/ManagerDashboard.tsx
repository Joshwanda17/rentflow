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
  UserPlus,
  UserCheck,
  CalendarPlus,
  Crown,
  Calendar
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import UserDetailsDialog from '@/components/manager/UserDetailsDialog';

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
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    full_name: string;
    email: string;
    phone: string;
    avatar_url: string | null;
    rent_discount_active: boolean;
    monthly_rent: number | null;
    roles: string[];
    average_rating: number | null;
    rating_count: number;
  } | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalFacilitated, setTotalFacilitated] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingLoans, setPendingLoans] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [newSignupsThisWeek, setNewSignupsThisWeek] = useState(0);
  const [topOnboarders, setTopOnboarders] = useState<{
    id: string;
    full_name: string;
    avatar_url: string | null;
    referral_count: number;
  }[]>([]);
  const [productivityFilter, setProductivityFilter] = useState<'week' | 'month' | 'all'>('all');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchProductivityData();
  }, [productivityFilter]);

  const getFilterDate = (filter: 'week' | 'month' | 'all') => {
    const now = new Date();
    if (filter === 'week') {
      now.setDate(now.getDate() - 7);
      return now.toISOString();
    } else if (filter === 'month') {
      now.setMonth(now.getMonth() - 1);
      return now.toISOString();
    }
    return null;
  };

  const fetchProductivityData = async () => {
    const filterDate = getFilterDate(productivityFilter);
    
    // Query referrals with optional date filter
    let query = supabase
      .from('referrals')
      .select('referrer_id');
    
    if (filterDate) {
      query = query.gte('created_at', filterDate);
    }
    
    const { data: referralsData } = await query;
    
    if (!referralsData || referralsData.length === 0) {
      setTopOnboarders([]);
      return;
    }
    
    // Count referrals per user
    const referralCounts: Record<string, number> = {};
    referralsData.forEach(r => {
      referralCounts[r.referrer_id] = (referralCounts[r.referrer_id] || 0) + 1;
    });
    
    // Get top 5 referrers
    const topReferrerIds = Object.entries(referralCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => id);
    
    if (topReferrerIds.length === 0) {
      setTopOnboarders([]);
      return;
    }
    
    // Fetch profiles for top referrers
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', topReferrerIds);
    
    const onboarders = topReferrerIds.map(id => {
      const profile = profiles?.find(p => p.id === id);
      return {
        id,
        full_name: profile?.full_name || 'Unknown',
        avatar_url: profile?.avatar_url || null,
        referral_count: referralCounts[id]
      };
    }).filter(o => o.referral_count > 0);
    
    setTopOnboarders(onboarders);
  };

  const fetchData = async () => {
    setLoading(true);
    
    // Calculate date for one week ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoISO = oneWeekAgo.toISOString();
    
    const [requestsRes, usersRes, ordersRes, loansRes, newUsersRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id, status, rent_amount'),
      supabase
        .from('profiles')
        .select('id, rent_discount_active, created_at'),
      supabase
        .from('product_orders')
        .select('id, status'),
      supabase
        .from('loan_applications')
        .select('id, status'),
      supabase
        .from('profiles')
        .select('id')
        .gte('created_at', oneWeekAgoISO)
    ]);
    
    const requests = requestsRes.data || [];
    const users = usersRes.data || [];
    
    setPendingRequests(requests.filter(r => r.status === 'pending').length);
    setTotalFacilitated(
      requests
        .filter(r => ['funded', 'disbursed', 'completed'].includes(r.status))
        .reduce((sum, r) => sum + Number(r.rent_amount), 0)
    );
    setTotalUsers(users.length);
    setActiveUsers(users.filter(u => u.rent_discount_active).length);
    setNewSignupsThisWeek(newUsersRes.data?.length || 0);
    setPendingOrders((ordersRes.data || []).filter(o => ['pending', 'processing'].includes(o.status)).length);
    setPendingLoans((loansRes.data || []).filter(l => l.status === 'pending').length);
    
    setLoading(false);
  };

  const handleSelectOnboarder = async (userId: string) => {
    // Fetch full user details including roles and ratings
    const [profileRes, rolesRes, ratingsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('tenant_ratings').select('rating').eq('tenant_id', userId)
    ]);

    if (profileRes.data) {
      const roles = (rolesRes.data || []).map(r => r.role);
      const ratings = (ratingsRes.data || []).map(r => r.rating);
      const avgRating = ratings.length > 0 
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
        : null;

      setSelectedUser({
        id: profileRes.data.id,
        full_name: profileRes.data.full_name,
        email: profileRes.data.email,
        phone: profileRes.data.phone,
        avatar_url: profileRes.data.avatar_url,
        rent_discount_active: profileRes.data.rent_discount_active,
        monthly_rent: profileRes.data.monthly_rent,
        roles,
        average_rating: avgRating,
        rating_count: ratings.length
      });
    }
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
        {/* PROMINENT User Management Card - First item */}
        <button 
          onClick={() => navigate('/manager-access?tab=users')}
          className="w-full text-left block"
        >
          <Card className="border-2 border-primary bg-gradient-to-br from-primary/10 via-primary/5 to-background hover:shadow-xl active:scale-[0.99] transition-all cursor-pointer overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <CardContent className="p-5 relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="p-4 rounded-2xl bg-primary text-primary-foreground shadow-lg">
                    <Users className="h-8 w-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-xl">User Management</h3>
                      <Badge className="bg-primary text-primary-foreground">
                        {totalUsers}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">View, search & manage all users</p>
                  </div>
                </div>
                <div className="p-3 rounded-full bg-primary/10">
                  <ArrowRight className="h-6 w-6 text-primary" />
                </div>
              </div>
              
              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-success/10 border border-success/20">
                  <div className="p-2 rounded-lg bg-success/20">
                    <UserCheck className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-success">{activeUsers}</p>
                    <p className="text-xs text-muted-foreground">Active users</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-chart-5/10 border border-chart-5/20">
                  <div className="p-2 rounded-lg bg-chart-5/20">
                    <CalendarPlus className="h-4 w-4 text-chart-5" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-chart-5">{newSignupsThisWeek}</p>
                    <p className="text-xs text-muted-foreground">New this week</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Manager Productivity - Top Onboarders Menu */}
        <Card className="border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-background overflow-hidden shadow-lg">
          <CardContent className="p-5">
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-amber-500/20 ring-2 ring-amber-500/30">
                    <Award className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">Manager Productivity</h3>
                      <Badge className="bg-amber-500 text-white">
                        <Crown className="h-3 w-3 mr-1" />
                        Leaderboard
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Who onboarded the most users</p>
                  </div>
                </div>
              </div>
              
              {/* Date Filter */}
              <Tabs value={productivityFilter} onValueChange={(v) => setProductivityFilter(v as 'week' | 'month' | 'all')} className="w-full">
                <TabsList className="grid w-full grid-cols-3 h-9">
                  <TabsTrigger value="week" className="text-xs gap-1">
                    <Calendar className="h-3 w-3" />
                    This Week
                  </TabsTrigger>
                  <TabsTrigger value="month" className="text-xs gap-1">
                    <Calendar className="h-3 w-3" />
                    This Month
                  </TabsTrigger>
                  <TabsTrigger value="all" className="text-xs gap-1">
                    <Calendar className="h-3 w-3" />
                    All Time
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            
            {topOnboarders.length > 0 ? (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <UserPlus className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Total Onboarded</span>
                    </div>
                    <p className="text-xl font-bold">{topOnboarders.reduce((sum, o) => sum + o.referral_count, 0)}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-success/10 border border-success/20">
                    <div className="flex items-center gap-2 mb-1">
                      <UserCheck className="h-4 w-4 text-success" />
                      <span className="text-xs font-medium text-success">Active Recruiters</span>
                    </div>
                    <p className="text-xl font-bold">{topOnboarders.length}</p>
                  </div>
                </div>

                {/* Leaderboard */}
                <div className="space-y-2">
                  {topOnboarders.map((onboarder, index) => (
                    <button 
                      key={onboarder.id}
                      onClick={() => handleSelectOnboarder(onboarder.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98] ${
                        index === 0 
                          ? 'bg-gradient-to-r from-amber-500/20 to-amber-500/10 border-2 border-amber-500/40 shadow-md' 
                          : index === 1 
                          ? 'bg-muted/60 border border-border hover:bg-muted' 
                          : index === 2 
                          ? 'bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/15' 
                          : 'hover:bg-muted/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 shadow-sm"
                        style={{
                          backgroundColor: index === 0 ? 'rgb(245 158 11)' : index === 1 ? 'rgb(156 163 175)' : index === 2 ? 'rgb(180 83 9)' : 'transparent',
                          color: index < 3 ? 'white' : 'inherit',
                          border: index >= 3 ? '2px solid hsl(var(--border))' : 'none'
                        }}
                      >
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                      </div>
                      <UserAvatar 
                        avatarUrl={onboarder.avatar_url} 
                        fullName={onboarder.full_name} 
                        size="sm" 
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <p className={`font-medium truncate ${index === 0 ? 'text-amber-700 dark:text-amber-300' : ''}`}>
                          {onboarder.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {index === 0 ? '🏆 Top Performer' : `Rank #${index + 1}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge 
                          variant={index === 0 ? "default" : "secondary"}
                          className={`text-sm px-3 py-1 ${index === 0 ? "bg-amber-500 text-white shadow-md" : ""}`}
                        >
                          {onboarder.referral_count} users
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <UserPlus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="font-medium">No onboarding activity yet</p>
                <p className="text-sm">Users who refer others will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>

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
      
      <UserDetailsDialog
        user={selectedUser}
        open={!!selectedUser}
        onOpenChange={(open) => !open && setSelectedUser(null)}
        onRolesUpdated={() => fetchData()}
      />
    </div>
  );
}
