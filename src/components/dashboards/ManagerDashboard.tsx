import { useState, useEffect } from 'react';
import { addDays, format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Users, FileText, CheckCircle, XCircle, Clock, Banknote, Send, Receipt, ArrowDownLeft, ArrowUpRight, Settings, UserCheck, TrendingUp, ShoppingCart, Package, Truck, PackageCheck, MoreVertical, Calendar, Trophy, Award, Medal, History, ChartBar } from 'lucide-react';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { formatUGX, AGENT_APPROVAL_BONUS } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import RoleSwitcher from '@/components/RoleSwitcher';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import AppBreadcrumb from '@/components/AppBreadcrumb';
import WelileLogo from '@/components/WelileLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WalletCard } from '@/components/wallet/WalletCard';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { NotificationBell } from '@/components/NotificationBell';
import { AgentFloatManager } from '@/components/manager/AgentFloatManager';
import { FinancialOverview } from '@/components/manager/FinancialOverview';
import { ManagerDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { ReceiptManagement } from '@/components/manager/ReceiptManagement';
import { QuickReceiptForm } from '@/components/receipts/QuickReceiptForm';
import { LoanLimitPromoCard } from '@/components/LoanLimitPromoCard';
import { LoanApplicationsManager } from '@/components/manager/LoanApplicationsManager';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface ManagerDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

interface RentRequest {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  landlord_id: string;
  supporter_id: string | null;
  rent_amount: number;
  duration_days: number;
  access_fee: number;
  request_fee: number;
  total_repayment: number;
  status: string;
  created_at: string;
  landlords?: { id: string; name: string; phone: string };
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  user_roles: { role: string }[];
}

interface PlatformTransaction {
  id: string;
  rent_request_id: string | null;
  user_id: string | null;
  transaction_type: string;
  amount: number;
  direction: string;
  description: string | null;
  created_at: string;
}

interface ProductOrder {
  id: string;
  product_id: string;
  buyer_id: string;
  agent_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  agent_commission: number;
  status: string;
  delivery_notes: string | null;
  created_at: string;
  status_updated_at: string | null;
  estimated_delivery_date: string | null;
  product?: { name: string; image_url: string | null };
  buyer?: { full_name: string };
  agent?: { full_name: string };
}

interface ReferralLeaderboardEntry {
  agent_id: string;
  agent_name: string;
  referral_count: number;
  total_earnings: number;
}

export default function ManagerDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: ManagerDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [requests, setRequests] = useState<RentRequest[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<PlatformTransaction[]>([]);
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('all');
  const [referralLeaderboard, setReferralLeaderboard] = useState<ReferralLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [requestsResult, usersResult, transactionsResult, ordersResult] = await Promise.all([
      supabase
        .from('rent_requests')
        .select(`
          id, tenant_id, agent_id, landlord_id, supporter_id, rent_amount, duration_days, 
          access_fee, request_fee, total_repayment, status, created_at,
          landlords (id, name, phone)
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, full_name, email, phone')
        .order('created_at', { ascending: false }),
      supabase
        .from('platform_transactions')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('product_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
    ]);
    
    const requestsData = requestsResult.data;
    const usersData = usersResult.data;
    const ordersData = ordersResult.data || [];
    
    // Fetch roles separately
    const userIds = usersData?.map(u => u.id) || [];
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds);
    
    // Fetch product names for orders
    const productIds = [...new Set(ordersData.map(o => o.product_id))];
    const { data: productsData } = productIds.length > 0 ? await supabase
      .from('products')
      .select('id, name, image_url')
      .in('id', productIds) : { data: [] };
    
    // Fetch buyer and agent profiles for orders
    const orderUserIds = [...new Set([...ordersData.map(o => o.buyer_id), ...ordersData.map(o => o.agent_id)])];
    const { data: orderProfilesData } = orderUserIds.length > 0 ? await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', orderUserIds) : { data: [] };
    
    const ordersWithDetails = ordersData.map(o => ({
      ...o,
      product: productsData?.find(p => p.id === o.product_id),
      buyer: orderProfilesData?.find(p => p.id === o.buyer_id),
      agent: orderProfilesData?.find(p => p.id === o.agent_id)
    }));
    
    const usersWithRoles = usersData?.map(u => ({
      ...u,
      user_roles: rolesData?.filter(r => r.user_id === u.id).map(r => ({ role: r.role })) || []
    })) || [];
    
    // Fetch referral leaderboard data
    const { data: referralsData } = await supabase
      .from('referrals')
      .select('referrer_id, bonus_amount, credited');
    
    // Aggregate referrals by agent
    const referralsByAgent = new Map<string, { count: number; earnings: number }>();
    (referralsData || []).forEach(r => {
      const current = referralsByAgent.get(r.referrer_id) || { count: 0, earnings: 0 };
      referralsByAgent.set(r.referrer_id, {
        count: current.count + 1,
        earnings: current.earnings + (r.credited ? Number(r.bonus_amount) : 0)
      });
    });
    
    // Get agent profiles for leaderboard
    const agentIds = Array.from(referralsByAgent.keys());
    const { data: agentProfiles } = agentIds.length > 0 ? await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', agentIds) : { data: [] };
    
    // Build leaderboard
    const leaderboard: ReferralLeaderboardEntry[] = agentIds
      .map(agentId => {
        const stats = referralsByAgent.get(agentId)!;
        const agentProfile = agentProfiles?.find(p => p.id === agentId);
        return {
          agent_id: agentId,
          agent_name: agentProfile?.full_name || 'Unknown Agent',
          referral_count: stats.count,
          total_earnings: stats.earnings
        };
      })
      .sort((a, b) => b.referral_count - a.referral_count)
      .slice(0, 10); // Top 10
    
    setRequests(requestsData || []);
    setUsers(usersWithRoles);
    setTransactions(transactionsResult.data || []);
    setOrders(ordersWithDetails);
    setReferralLeaderboard(leaderboard);
    setLoading(false);
  };

  const handleApprove = async (requestId: string, agentId: string | null) => {
    const { error } = await supabase
      .from('rent_requests')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    // Pay agent approval bonus if there's an agent
    if (agentId) {
      await supabase.from('platform_transactions').insert({
        rent_request_id: requestId,
        user_id: agentId,
        transaction_type: 'agent_approval_bonus',
        amount: AGENT_APPROVAL_BONUS,
        direction: 'out',
        description: 'Agent approval bonus'
      });
    }

    toast({ title: 'Request Approved', description: 'The rent request has been approved' });
    fetchData();
  };

  const handleReject = async (requestId: string) => {
    const { error } = await supabase
      .from('rent_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Request Rejected', description: 'The rent request has been rejected' });
    fetchData();
  };

  const handleDisburse = async (request: RentRequest) => {
    // Update request status to disbursed
    const { error: updateError } = await supabase
      .from('rent_requests')
      .update({
        status: 'disbursed',
        disbursed_at: new Date().toISOString()
      })
      .eq('id', request.id);

    if (updateError) {
      toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
      return;
    }

    // Create landlord payout transaction
    // Note: We need to find landlord's user account or use a system record
    await supabase.from('platform_transactions').insert({
      rent_request_id: request.id,
      user_id: request.landlord_id, // Using landlord_id from rent_requests
      transaction_type: 'landlord_payout',
      amount: Number(request.rent_amount),
      direction: 'out',
      description: `Rent payout for request`
    });

    // Record platform revenue (access fee + request fee)
    await supabase.from('platform_transactions').insert({
      rent_request_id: request.id,
      user_id: null,
      transaction_type: 'platform_fee',
      amount: Number(request.access_fee) + Number(request.request_fee),
      direction: 'in',
      description: 'Platform fees from rent facilitation'
    });

    toast({ 
      title: 'Disbursement Complete', 
      description: `${formatUGX(Number(request.rent_amount))} has been marked as paid to landlord`
    });
    fetchData();
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    // Calculate estimated delivery date based on status
    let estimatedDeliveryDate: string | null = null;
    
    if (newStatus === 'processing') {
      // Estimate 5 days from now for processing
      estimatedDeliveryDate = format(addDays(new Date(), 5), 'yyyy-MM-dd');
    } else if (newStatus === 'shipped') {
      // Estimate 2 days from now for shipped
      estimatedDeliveryDate = format(addDays(new Date(), 2), 'yyyy-MM-dd');
    }
    
    const updateData: Record<string, unknown> = {
      status: newStatus,
      status_updated_at: new Date().toISOString()
    };
    
    if (estimatedDeliveryDate) {
      updateData.estimated_delivery_date = estimatedDeliveryDate;
    }
    
    const { error } = await supabase
      .from('product_orders')
      .update(updateData)
      .eq('id', orderId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    const message = estimatedDeliveryDate 
      ? `Order status changed to ${newStatus}. Estimated delivery: ${format(new Date(estimatedDeliveryDate), 'MMM d, yyyy')}`
      : `Order status changed to ${newStatus}`;

    toast({ 
      title: 'Status Updated', 
      description: message
    });
    fetchData();
  };

  const getNextStatusOptions = (currentStatus: string) => {
    const statusFlow: Record<string, string[]> = {
      'pending': ['processing', 'cancelled'],
      'processing': ['shipped', 'cancelled'],
      'shipped': ['delivered'],
      'delivered': ['completed'],
      'completed': [],
      'cancelled': []
    };
    return statusFlow[currentStatus] || [];
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const approvedRequests = requests.filter(r => r.status === 'approved');
  const fundedRequests = requests.filter(r => r.status === 'funded');
  const disbursedRequests = requests.filter(r => ['disbursed', 'completed'].includes(r.status));
  
  const totalFacilitated = [...fundedRequests, ...disbursedRequests].reduce((sum, r) => sum + Number(r.rent_amount), 0);
  const totalPlatformRevenue = requests
    .filter(r => ['funded', 'disbursed', 'completed'].includes(r.status))
    .reduce((sum, r) => sum + Number(r.access_fee) + Number(r.request_fee), 0);
  
  // Marketplace metrics
  const totalMarketplaceSales = orders.reduce((sum, o) => sum + Number(o.total_price), 0);
  const totalMarketplaceCommissions = orders.reduce((sum, o) => sum + Number(o.agent_commission), 0);
  const pendingOrders = orders.filter(o => ['pending', 'processing'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'delivered' || o.status === 'completed');
  
  // Filtered orders based on status filter
  const filteredOrders = orderStatusFilter === 'all' 
    ? orders 
    : orders.filter(o => o.status === orderStatusFilter);
  
  // Order counts by status
  const orderCountsByStatus = {
    all: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    shipped: orders.filter(o => o.status === 'shipped').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-warning/20 text-warning';
      case 'approved': return 'bg-primary/20 text-primary';
      case 'funded': return 'bg-success/20 text-success';
      case 'disbursed': return 'bg-success/20 text-success';
      case 'completed': return 'bg-muted text-muted-foreground';
      case 'rejected': return 'bg-destructive/20 text-destructive';
      case 'processing': return 'bg-primary/20 text-primary';
      case 'shipped': return 'bg-chart-5/20 text-chart-5';
      case 'delivered': return 'bg-success/20 text-success';
      case 'cancelled': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      tenant: 'bg-primary/20 text-primary',
      agent: 'bg-warning/20 text-warning',
      supporter: 'bg-success/20 text-success',
      landlord: 'bg-chart-5/20 text-chart-5',
      manager: 'bg-destructive/20 text-destructive'
    };
    return colors[role] || 'bg-muted text-muted-foreground';
  };

  if (loading) {
    return <ManagerDashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="sm" />
            <WelileLogo showText={false} />
            <RoleSwitcher
              currentRole={currentRole} 
              availableRoles={availableRoles} 
              onRoleChange={onRoleChange} 
            />
          </div>
          <div className="hidden md:flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
            {addRoleComponent}
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
          <div className="md:hidden flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <AppBreadcrumb />
        
        {/* Wallet */}
        <WalletCard />

        {/* Loan Limit Promo */}
        <LoanLimitPromoCard userId={user.id} />

        {/* Quick Receipt Form */}
        <QuickReceiptForm userId={user.id} />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <div className="rounded-xl border bg-card p-4 shadow-soft transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-warning/10">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pending</p>
                <p className="text-2xl font-semibold font-mono tabular-nums">{pendingRequests.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-soft transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-success/10">
                <Banknote className="h-5 w-5 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Facilitated</p>
                <p className="text-xl font-semibold font-mono tabular-nums truncate">{formatUGX(totalFacilitated)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-soft transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-chart-5/10">
                <TrendingUp className="h-5 w-5 text-chart-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Revenue</p>
                <p className="text-xl font-semibold font-mono tabular-nums truncate">{formatUGX(totalPlatformRevenue)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-soft transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Marketplace Sales</p>
                <p className="text-xl font-semibold font-mono tabular-nums truncate">{formatUGX(totalMarketplaceSales)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-soft transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-warning/10">
                <Package className="h-5 w-5 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Orders</p>
                <p className="text-2xl font-semibold font-mono tabular-nums">{orders.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 shadow-soft transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-success/10">
                <Users className="h-5 w-5 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Agent Commissions</p>
                <p className="text-xl font-semibold font-mono tabular-nums truncate">{formatUGX(totalMarketplaceCommissions)}</p>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="pending" className="space-y-4">
          <div className="overflow-x-auto -mx-4 px-4 pb-1">
            <TabsList className="w-max min-w-full md:w-auto bg-muted/50">
              <TabsTrigger value="pending" className="text-xs md:text-sm gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Pending ({pendingRequests.length})
              </TabsTrigger>
              <TabsTrigger value="funded" className="text-xs md:text-sm gap-1.5">
                <Banknote className="h-3.5 w-3.5" />
                Funded ({fundedRequests.length})
              </TabsTrigger>
              <TabsTrigger value="loans" className="text-xs md:text-sm gap-1.5">
                <Banknote className="h-3.5 w-3.5" />
                Loan Apps
              </TabsTrigger>
              <TabsTrigger value="marketplace" className="text-xs md:text-sm gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5" />
                Marketplace ({orders.length})
              </TabsTrigger>
              <TabsTrigger value="financials" className="text-xs md:text-sm gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Financials
              </TabsTrigger>
              <TabsTrigger value="leaderboard" className="text-xs md:text-sm gap-1.5">
                <Trophy className="h-3.5 w-3.5" />
                Leaderboard
              </TabsTrigger>
              <TabsTrigger value="agents" className="text-xs md:text-sm gap-1.5">
                <UserCheck className="h-3.5 w-3.5" />
                Agents
              </TabsTrigger>
              <TabsTrigger value="transactions" className="text-xs md:text-sm gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                Payments
              </TabsTrigger>
              <TabsTrigger value="users" className="text-xs md:text-sm gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Users
              </TabsTrigger>
              <TabsTrigger value="receipts" className="text-xs md:text-sm gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                Receipts
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pending">
            <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
              <div className="p-5 border-b border-border bg-muted/30">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <FileText className="h-4 w-4 text-warning" />
                  </div>
                  Pending Approval
                </h3>
              </div>
              <div className="p-5">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No pending requests</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingRequests.map((request) => (
                      <div 
                        key={request.id} 
                        className="p-4 rounded-lg bg-secondary/50 space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-lg">{formatUGX(Number(request.rent_amount))}</p>
                            <p className="text-sm text-muted-foreground">
                              {request.duration_days} days • Daily: {formatUGX(Number(request.total_repayment) / request.duration_days)}
                            </p>
                            {request.landlords && (
                              <p className="text-sm text-muted-foreground">
                                Landlord: {request.landlords.name} ({request.landlords.phone})
                              </p>
                            )}
                          </div>
                          <Badge className={getStatusColor(request.status)}>
                            {request.status}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleApprove(request.id, request.agent_id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => handleReject(request.id)}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="funded">
            <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
              <div className="p-5 border-b border-border bg-muted/30">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Banknote className="h-4 w-4 text-success" />
                  </div>
                  Ready for Disbursement
                </h3>
              </div>
              <div className="p-5">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : fundedRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <Banknote className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No funded requests awaiting disbursement</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fundedRequests.map((request) => (
                      <div 
                        key={request.id} 
                        className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-3 transition-all hover:border-border"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-lg">{formatUGX(Number(request.rent_amount))}</p>
                            <p className="text-sm text-muted-foreground">
                              {request.duration_days} days • Daily: {formatUGX(Number(request.total_repayment) / request.duration_days)}
                            </p>
                            {request.landlords && (
                              <p className="text-sm text-muted-foreground">
                                Landlord: {request.landlords.name} ({request.landlords.phone})
                              </p>
                            )}
                            <p className="text-xs text-success mt-1 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Funded by supporter • Ready to disburse
                            </p>
                          </div>
                          <Badge variant="success">
                            {request.status}
                          </Badge>
                        </div>
                        <Button 
                          size="sm" 
                          variant="success"
                          onClick={() => handleDisburse(request)}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Disburse to Landlord
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="loans">
            <LoanApplicationsManager />
          </TabsContent>

          <TabsContent value="marketplace">
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Marketplace Orders
                </CardTitle>
                <div className="flex flex-wrap gap-4 text-sm mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Total Sales:</span>
                    <span className="font-mono font-semibold text-success">{formatUGX(totalMarketplaceSales)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Agent Commissions:</span>
                    <span className="font-mono font-semibold text-warning">{formatUGX(totalMarketplaceCommissions)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Pending Orders:</span>
                    <span className="font-mono font-semibold">{pendingOrders.length}</span>
                  </div>
                </div>
                
                {/* Status Filter Buttons */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {[
                    { key: 'all', label: 'All', icon: Package },
                    { key: 'pending', label: 'Pending', icon: Clock },
                    { key: 'processing', label: 'Processing', icon: Clock },
                    { key: 'shipped', label: 'Shipped', icon: Truck },
                    { key: 'delivered', label: 'Delivered', icon: PackageCheck },
                    { key: 'completed', label: 'Completed', icon: CheckCircle },
                  ].map(({ key, label, icon: Icon }) => (
                    <Button
                      key={key}
                      variant={orderStatusFilter === key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setOrderStatusFilter(key)}
                      className="gap-1.5"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {orderCountsByStatus[key as keyof typeof orderCountsByStatus]}
                      </Badge>
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                {filteredOrders.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {orders.length === 0 ? 'No marketplace orders yet' : `No ${orderStatusFilter} orders`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredOrders.map((order) => {
                      const nextStatuses = getNextStatusOptions(order.status);
                      return (
                        <div 
                          key={order.id} 
                          className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50"
                        >
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                            {order.product?.image_url ? (
                              <img src={order.product.image_url} alt={order.product?.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{order.product?.name || 'Unknown Product'}</p>
                            <p className="text-sm text-muted-foreground">
                              Qty: {order.quantity} • {order.buyer?.full_name || 'Unknown Buyer'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Agent: {order.agent?.full_name || 'Unknown'} • {new Date(order.created_at).toLocaleDateString()}
                            </p>
                            {order.estimated_delivery_date && (
                              <div className="flex items-center gap-1 mt-1">
                                <Calendar className="h-3 w-3 text-primary" />
                                <span className="text-xs text-primary font-medium">
                                  Est. delivery: {format(new Date(order.estimated_delivery_date), 'MMM d, yyyy')}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <div>
                              <p className="font-mono font-semibold">{formatUGX(Number(order.total_price))}</p>
                              <p className="text-xs text-success">+{formatUGX(Number(order.agent_commission))} comm.</p>
                              <Badge className={getStatusColor(order.status)}>
                                {order.status}
                              </Badge>
                            </div>
                            {nextStatuses.length > 0 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Update Status</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {nextStatuses.map((status) => (
                                    <DropdownMenuItem
                                      key={status}
                                      onClick={() => handleUpdateOrderStatus(order.id, status)}
                                      className="gap-2"
                                    >
                                      {status === 'processing' && <Clock className="h-4 w-4 text-primary" />}
                                      {status === 'shipped' && <Truck className="h-4 w-4 text-chart-5" />}
                                      {status === 'delivered' && <PackageCheck className="h-4 w-4 text-success" />}
                                      {status === 'completed' && <CheckCircle className="h-4 w-4 text-success" />}
                                      {status === 'cancelled' && <XCircle className="h-4 w-4 text-destructive" />}
                                      <span className="capitalize">{status}</span>
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financials">
            <FinancialOverview />
          </TabsContent>

          <TabsContent value="leaderboard">
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-warning" />
                  Referral Leaderboard
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Top agents by member referrals
                </p>
              </CardHeader>
              <CardContent>
                {referralLeaderboard.length === 0 ? (
                  <div className="text-center py-8">
                    <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No referrals yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {referralLeaderboard.map((entry, index) => (
                      <div 
                        key={entry.agent_id} 
                        className={`flex items-center gap-4 p-4 rounded-lg transition-all ${
                          index === 0 ? 'bg-gradient-to-r from-warning/20 to-warning/5 border border-warning/30' :
                          index === 1 ? 'bg-gradient-to-r from-muted/50 to-muted/20 border border-border' :
                          index === 2 ? 'bg-gradient-to-r from-orange-500/10 to-orange-500/5 border border-orange-500/20' :
                          'bg-secondary/50'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                          index === 0 ? 'bg-warning text-warning-foreground' :
                          index === 1 ? 'bg-muted-foreground/20 text-muted-foreground' :
                          index === 2 ? 'bg-orange-500/20 text-orange-600' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {index === 0 ? <Trophy className="h-5 w-5" /> :
                           index === 1 ? <Award className="h-5 w-5" /> :
                           index === 2 ? <Medal className="h-5 w-5" /> :
                           <span>{index + 1}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{entry.agent_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {entry.referral_count} {entry.referral_count === 1 ? 'referral' : 'referrals'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold text-success">
                            {formatUGX(entry.total_earnings)}
                          </p>
                          <p className="text-xs text-muted-foreground">earned</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agents">
            <AgentFloatManager />
          </TabsContent>

          <TabsContent value="all">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">All Rent Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {requests.map((request) => (
                    <div 
                      key={request.id} 
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                    >
                      <div>
                        <p className="font-medium">{formatUGX(Number(request.rent_amount))}</p>
                        <p className="text-sm text-muted-foreground">
                          {request.duration_days} days • {new Date(request.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className={getStatusColor(request.status)}>
                        {request.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Payment History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : transactions.length === 0 ? (
                  <p className="text-muted-foreground">No transactions recorded yet</p>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((tx) => (
                      <div 
                        key={tx.id} 
                        className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50"
                      >
                        <div className={`p-2 rounded-lg ${tx.direction === 'in' ? 'bg-success/10' : 'bg-destructive/10'}`}>
                          {tx.direction === 'in' ? (
                            <ArrowDownLeft className="h-4 w-4 text-success" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-destructive" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium capitalize">{tx.transaction_type.replace(/_/g, ' ')}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {tx.description || 'No description'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-mono font-semibold ${tx.direction === 'in' ? 'text-success' : 'text-destructive'}`}>
                            {tx.direction === 'in' ? '+' : '-'}{formatUGX(Number(tx.amount))}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {tx.direction === 'in' ? 'Inflow' : 'Outflow'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Platform Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {users.map((u) => (
                    <div 
                      key={u.id} 
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                    >
                      <div>
                        <p className="font-medium">{u.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {u.email} • {u.phone}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {u.user_roles.map((r, i) => (
                          <Badge key={i} className={getRoleBadge(r.role)}>
                            {r.role}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="receipts">
            <ReceiptManagement userId={user.id} />
          </TabsContent>
        </Tabs>
      </main>
      
      <FloatingActionButton
        actions={[
          {
            icon: Receipt,
            label: 'My Receipts',
            onClick: () => navigate('/my-receipts'),
          },
          {
            icon: FileText,
            label: 'Pending Requests',
            onClick: () => document.querySelector('[value="requests"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
          },
          {
            icon: ShoppingCart,
            label: 'Orders',
            onClick: () => document.querySelector('[value="orders"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
          },
          {
            icon: Users,
            label: 'View Users',
            onClick: () => document.querySelector('[value="users"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
          },
          {
            icon: TrendingUp,
            label: 'Financial Overview',
            onClick: () => document.querySelector('[value="finances"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
          },
        ]}
      />
      
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </div>
  );
}
