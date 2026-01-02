import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Wallet, TrendingUp, HandCoins, Settings, Sparkles, Zap, Clock, ArrowRight, Coins, History, Receipt, Send, Share2 } from 'lucide-react';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
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
import { SupporterDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { QuickReceiptForm } from '@/components/receipts/QuickReceiptForm';
import { LoanLimitPromoCard } from '@/components/LoanLimitPromoCard';
import { QuickActions } from '@/components/QuickActions';
import { StatusIndicator } from '@/components/StatusIndicator';
import { SwipeableRow } from '@/components/SwipeableRow';
import { Eye } from 'lucide-react';
import { PullToRefresh } from '@/components/PullToRefresh';

interface SupporterDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

interface AvailableRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
  created_at: string;
}

interface FundedRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
  funded_at: string;
}

export default function SupporterDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: SupporterDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [availableRequests, setAvailableRequests] = useState<AvailableRequest[]>([]);
  const [fundedRequests, setFundedRequests] = useState<FundedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    // Approved requests waiting for funding
    const { data: available } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, duration_days, status, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: true });
    
    // Requests funded by this supporter
    const { data: funded } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, duration_days, status, funded_at')
      .eq('supporter_id', user.id)
      .order('funded_at', { ascending: false });
    
    setAvailableRequests(available || []);
    setFundedRequests(funded || []);
    setLoading(false);
  };

  const fundRequest = async (requestId: string, rentAmount: number) => {
    const { error } = await supabase
      .from('rent_requests')
      .update({
        supporter_id: user.id,
        status: 'funded',
        funded_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .eq('status', 'approved');

    if (error) {
      toast({
        title: 'Funding Failed',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      // Record the transaction
      await supabase.from('platform_transactions').insert({
        rent_request_id: requestId,
        user_id: user.id,
        transaction_type: 'supporter_funding',
        amount: rentAmount,
        direction: 'out',
        description: 'Rent facilitation funding'
      });

      toast({
        title: 'Request Funded!',
        description: `You've funded ${formatUGX(rentAmount)} for rent facilitation`
      });
      fetchData();
    }
  };

  const totalFunded = fundedRequests.reduce((sum, r) => sum + Number(r.rent_amount), 0);
  const expectedRewards = fundedRequests
    .filter(r => r.status !== 'completed')
    .reduce((sum, r) => sum + calculateSupporterReward(Number(r.rent_amount)), 0);

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'funded': return 'default';
      case 'disbursed': return 'success';
      default: return 'secondary';
    }
  };

  if (loading) {
    return <SupporterDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await fetchData();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-background pb-20 md:pb-0">
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
              Fund rent requests and earn 15% returns
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          </div>
        </div>

        {/* Quick Actions - Large icon buttons */}
        <QuickActions
          actions={[
            {
              icon: HandCoins,
              label: 'Fund',
              onClick: () => document.getElementById('available-requests')?.scrollIntoView({ behavior: 'smooth' }),
              color: 'primary',
            },
            {
              icon: TrendingUp,
              label: 'Earnings',
              onClick: () => navigate('/transactions'),
              color: 'success',
            },
            {
              icon: Share2,
              label: 'Share',
              onClick: () => navigate('/benefits'),
              color: 'primary',
            },
            {
              icon: Receipt,
              label: 'Receipts',
              onClick: () => navigate('/my-receipts'),
              color: 'warning',
            },
          ]}
        />
        
        {/* Wallet */}
        <WalletCard />

        {/* Loan Limit Promo */}
        <LoanLimitPromoCard userId={user.id} />

        {/* Quick Receipt Form */}
        <QuickReceiptForm userId={user.id} />

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="elevated-card group hover:shadow-glow transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:scale-110 transition-transform duration-300">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground font-medium">Total Funded</p>
                  <p className="metric-value text-xl truncate">{formatUGX(totalFunded)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="elevated-card group hover:shadow-glow transition-all duration-300 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-success/5 to-transparent" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-success/20 to-success/5 group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground font-medium">Expected Rewards</p>
                  <p className="metric-value text-xl text-success truncate">
                    {formatUGX(expectedRewards)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="elevated-card group hover:shadow-glow transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-warning/20 to-warning/5 group-hover:scale-110 transition-transform duration-300">
                  <HandCoins className="h-5 w-5 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground font-medium">Active Fundings</p>
                  <p className="metric-value text-2xl">
                    {fundedRequests.filter(r => r.status !== 'completed').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Card */}
        <Card className="elevated-card border-primary/20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-success/5" />
          <CardContent className="pt-6 relative">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-success/20 to-success/5">
                <Zap className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Earn 15% Returns</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Fund approved rent requests and earn 15% reward when the tenant completes repayment.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Available Requests */}
        <Card className="elevated-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Clock className="h-4 w-4 text-warning" />
              </div>
              <CardTitle className="text-lg font-semibold">Available Rent Requests</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono">
              {availableRequests.length} available
            </Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : availableRequests.length === 0 ? (
              <div className="text-center py-8">
                <HandCoins className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No approved requests available for funding.</p>
                <p className="text-sm text-muted-foreground/70">Check back later for new opportunities.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableRequests.map((request, index) => {
                  const reward = calculateSupporterReward(Number(request.rent_amount));
                  return (
                    <div 
                      key={request.id} 
                      className="group flex items-center justify-between p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 border border-border/50 hover:border-primary/30 transition-all duration-200"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">{formatUGX(Number(request.rent_amount))}</p>
                        <p className="text-sm text-muted-foreground">
                          {request.duration_days} days • Reward: <span className="text-success font-medium">{formatUGX(reward)}</span>
                        </p>
                      </div>
                      <Button 
                        size="sm"
                        onClick={() => fundRequest(request.id, Number(request.rent_amount))}
                        className="gap-2"
                      >
                        Fund
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funded Requests */}
        <Card className="elevated-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
              <CardTitle className="text-lg font-semibold">My Funded Requests</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono">
              {fundedRequests.length} total
            </Badge>
          </CardHeader>
          <CardContent>
            {fundedRequests.length === 0 ? (
              <div className="text-center py-8">
                <Wallet className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">You haven't funded any requests yet.</p>
                <p className="text-sm text-muted-foreground/70">Start funding to earn rewards.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fundedRequests.map((request, index) => (
                  <SwipeableRow
                    key={request.id}
                    rightActions={[
                      {
                        icon: Eye,
                        label: 'View',
                        onClick: () => navigate('/transactions'),
                        color: 'primary',
                      },
                    ]}
                  >
                    <div 
                      className="group flex items-center justify-between p-4 bg-secondary/30 hover:bg-secondary/50 border border-border/50 hover:border-success/30 transition-all duration-200"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex items-center gap-3">
                        <StatusIndicator status={request.status} size="md" />
                        <div>
                          <p className="font-semibold text-foreground">{formatUGX(Number(request.rent_amount))}</p>
                          <p className="text-xs text-muted-foreground">
                            +{formatUGX(calculateSupporterReward(Number(request.rent_amount)))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </SwipeableRow>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      
      <FloatingActionButton
        actions={[
          {
            icon: Coins,
            label: 'Available Requests',
            onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
          },
          {
            icon: Receipt,
            label: 'My Receipts',
            onClick: () => navigate('/my-receipts'),
          },
          {
            icon: History,
            label: 'My Fundings',
            onClick: () => document.getElementById('funded-requests')?.scrollIntoView({ behavior: 'smooth' }),
          },
        ]}
      />
      
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
