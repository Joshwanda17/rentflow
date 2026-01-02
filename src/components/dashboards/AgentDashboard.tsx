import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Users, Coins, Link2, Copy, Check, Settings, ArrowDownCircle, ArrowUpCircle, TrendingUp, Sparkles, Zap, Store, BarChart3, History, Package, Receipt } from 'lucide-react';
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
import { AgentDepositDialog } from '@/components/agent/AgentDepositDialog';
import { AgentWithdrawalDialog } from '@/components/agent/AgentWithdrawalDialog';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { AgentDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { AgentProductsSection } from '@/components/marketplace/AgentProductsSection';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Banknote } from 'lucide-react';
import { AgentLoanProducts } from '@/components/loans/AgentLoanProducts';
import { QuickReceiptForm } from '@/components/receipts/QuickReceiptForm';
import { LoanLimitPromoCard } from '@/components/LoanLimitPromoCard';

interface AgentDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

interface RentRequest {
  id: string;
  rent_amount: number;
  status: string;
  created_at: string;
}

export default function AgentDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: AgentDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { totalEarnings, commissionTotal, bonusTotal } = useAgentEarnings();
  const [rentRequests, setRentRequests] = useState<RentRequest[]>([]);
  const [referralCount, setReferralCount] = useState(0);
  const [referralEarnings, setReferralEarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const { toast } = useToast();

  const referralLink = `${window.location.origin}/auth?ref=${user.id}`;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [requestsRes, referralsRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id, rent_amount, status, created_at')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('referrals')
        .select('id, bonus_amount, credited')
        .eq('referrer_id', user.id)
    ]);
    
    setRentRequests(requestsRes.data || []);
    
    const referrals = referralsRes.data || [];
    setReferralCount(referrals.length);
    setReferralEarnings(referrals.filter(r => r.credited).reduce((sum, r) => sum + Number(r.bonus_amount), 0));
    
    setLoading(false);
  };

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast({
      title: 'Link Copied!',
      description: 'Share this link with potential tenants'
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const approvedCount = rentRequests.filter(r => r.status !== 'pending' && r.status !== 'rejected').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'approved': return 'default';
      case 'funded': return 'success';
      case 'disbursed': return 'success';
      case 'completed': return 'secondary';
      case 'rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  if (loading) {
    return <AgentDashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Modern Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-border/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="sm" />
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full border-2 border-background" />
              </div>
              <div className="hidden sm:block">
                <WelileLogo showText={false} />
              </div>
              <RoleSwitcher
                currentRole={currentRole} 
                availableRoles={availableRoles} 
                onRoleChange={onRoleChange} 
              />
            </div>
            
            <div className="hidden md:flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
              {addRoleComponent}
              <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="text-muted-foreground hover:text-foreground">
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="md:hidden flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 animate-fade-in">
        <AppBreadcrumb />
        
        {/* Welcome Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your customers and track your earnings
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          </div>
        </div>
        
        {/* Agent Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Button 
            onClick={() => setDepositOpen(true)} 
            className="h-16 text-base gap-3 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-glow"
            size="lg"
          >
            <div className="p-2 rounded-lg bg-white/20">
              <ArrowDownCircle className="h-5 w-5" />
            </div>
            <span>Customer Deposit</span>
          </Button>
          <Button 
            onClick={() => setWithdrawalOpen(true)} 
            className="h-16 text-base gap-3" 
            variant="outline"
            size="lg"
          >
            <div className="p-2 rounded-lg bg-primary/10">
              <ArrowUpCircle className="h-5 w-5 text-primary" />
            </div>
            <span>Customer Withdrawal</span>
          </Button>
        </div>

        {/* Wallet */}
        <WalletCard />

        {/* Loan Limit Promo */}
        <LoanLimitPromoCard userId={user.id} />

        {/* Quick Receipt Form */}
        <QuickReceiptForm userId={user.id} />

        {/* Tabs for Dashboard and Marketplace */}
        <Tabs defaultValue="dashboard" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dashboard" className="gap-2">
              <Users className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="loans" className="gap-2">
              <Banknote className="h-4 w-4" />
              Loans
            </TabsTrigger>
            <TabsTrigger value="marketplace" className="gap-2">
              <Store className="h-4 w-4" />
              My Shop
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            {/* Referral Link */}
            <Card className="elevated-card border-primary/20 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-success/5" />
              <CardHeader className="relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Link2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-semibold">Your Referral Link</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Earn UGX 100 per new member signup
                      </p>
                    </div>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-muted-foreground">Members Referred</p>
                    <p className="text-xl font-bold text-success">{referralCount}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="relative space-y-4">
                <div className="flex gap-2">
                  <code className="flex-1 p-3 bg-secondary/50 rounded-xl text-sm truncate font-mono border border-border/50">
                    {referralLink}
                  </code>
                  <Button 
                    onClick={copyReferralLink} 
                    variant={copied ? "success" : "outline"}
                    size="lg"
                    className="shrink-0 gap-2"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                {referralCount > 0 && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-success/10 border border-success/20">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-success" />
                      <span className="text-sm font-medium">Referral Earnings</span>
                    </div>
                    <span className="font-bold text-success">{formatUGX(referralEarnings)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="elevated-card group hover:shadow-glow transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:scale-110 transition-transform duration-300">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground font-medium">Tenants Registered</p>
                      <p className="metric-value text-2xl">{rentRequests.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="elevated-card group hover:shadow-glow transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-success/20 to-success/5 group-hover:scale-110 transition-transform duration-300">
                      <Check className="h-5 w-5 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground font-medium">Approved Requests</p>
                      <p className="metric-value text-2xl">{approvedCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="elevated-card group hover:shadow-glow transition-all duration-300 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-success/5 to-transparent" />
                <CardContent className="pt-6 relative">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-warning/20 to-warning/5 group-hover:scale-110 transition-transform duration-300">
                      <Coins className="h-5 w-5 text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground font-medium">Total Earnings</p>
                      <p className="metric-value text-2xl text-success truncate">
                        {formatUGX(totalEarnings)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Earnings Breakdown */}
            <Card className="elevated-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Zap className="h-4 w-4 text-success" />
                  </div>
                  <CardTitle className="text-lg font-semibold">Earnings Breakdown</CardTitle>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => navigate('/earnings')}
                  className="gap-2"
                >
                  <TrendingUp className="h-4 w-4" />
                  View All
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <p className="text-sm text-muted-foreground font-medium">Approval Bonuses</p>
                    </div>
                    <p className="metric-value text-xl">{formatUGX(bonusTotal)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{approvedCount} × UGX 5,000</p>
                  </div>
                  <div className="p-5 rounded-xl bg-gradient-to-br from-success/10 to-success/5 border border-success/20">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <p className="text-sm text-muted-foreground font-medium">Repayment Commissions</p>
                    </div>
                    <p className="metric-value text-xl text-success">{formatUGX(commissionTotal)}</p>
                    <p className="text-xs text-muted-foreground mt-1">5% of tenant repayments</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Registered Tenants */}
            <Card className="elevated-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-lg font-semibold">Registered Tenants</CardTitle>
                </div>
                <Badge variant="outline" className="font-mono">
                  {rentRequests.length} total
                </Badge>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : rentRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-muted-foreground">No tenants registered yet.</p>
                    <p className="text-sm text-muted-foreground/70">Share your referral link to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rentRequests.map((request, index) => (
                      <div 
                        key={request.id} 
                        className="group flex items-center justify-between p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 border border-border/50 hover:border-primary/30 transition-all duration-200"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">{formatUGX(Number(request.rent_amount))}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={getStatusColor(request.status)}>
                          {request.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="loans" className="space-y-6">
            <AgentLoanProducts />
          </TabsContent>

          <TabsContent value="marketplace" className="space-y-4">
            {/* Analytics Link */}
            <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Sales Analytics</p>
                      <p className="text-sm text-muted-foreground">Track your product performance</p>
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => navigate('/analytics')} className="gap-2">
                    <TrendingUp className="h-4 w-4" />
                    View Analytics
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <AgentProductsSection />
          </TabsContent>
        </Tabs>
      </main>
      
      <FloatingActionButton
        actions={[
          {
            icon: ArrowDownCircle,
            label: 'Customer Deposit',
            onClick: () => setDepositOpen(true),
          },
          {
            icon: ArrowUpCircle,
            label: 'Customer Withdrawal',
            onClick: () => setWithdrawalOpen(true),
          },
          {
            icon: Receipt,
            label: 'My Receipts',
            onClick: () => navigate('/my-receipts'),
          },
          {
            icon: History,
            label: 'View Earnings',
            onClick: () => navigate('/earnings'),
          },
          {
            icon: Package,
            label: 'Add Product',
            onClick: () => {}, // This will be handled by the marketplace tab
          },
        ]}
      />
      
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
      
      <AgentDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <AgentWithdrawalDialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen} />
    </div>
  );
}
