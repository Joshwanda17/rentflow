import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Banknote, Building, CheckCircle, Settings, Sparkles, History, TrendingUp, Wallet, Receipt, QrCode, Send, Share2 } from 'lucide-react';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { formatUGX } from '@/lib/rentCalculations';
import RoleSwitcher from '@/components/RoleSwitcher';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import AppBreadcrumb from '@/components/AppBreadcrumb';
import WelileLogo from '@/components/WelileLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import MobileBottomNav from '@/components/MobileBottomNav';
import { WalletCard } from '@/components/wallet/WalletCard';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { NotificationBell } from '@/components/NotificationBell';
import { LandlordDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { QuickReceiptForm } from '@/components/receipts/QuickReceiptForm';
import { LoanLimitPromoCard } from '@/components/LoanLimitPromoCard';
import { QuickActions } from '@/components/QuickActions';
import { PullToRefresh } from '@/components/PullToRefresh';
import { ReferralStatsCard } from '@/components/ReferralStatsCard';

interface LandlordDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

interface Payment {
  id: string;
  amount: number;
  created_at: string;
  description: string;
}

export default function LandlordDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: LandlordDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const { data } = await supabase
      .from('platform_transactions')
      .select('id, amount, created_at, description')
      .eq('user_id', user.id)
      .eq('transaction_type', 'landlord_payout')
      .order('created_at', { ascending: false });
    
    setPayments(data || []);
    setLoading(false);
  };

  const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  if (loading) {
    return <LandlordDashboardSkeleton />;
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
              Track your rent payments and property income
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
              icon: Receipt,
              label: 'Receipts',
              onClick: () => navigate('/my-receipts'),
              color: 'primary',
            },
            {
              icon: History,
              label: 'Payments',
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
              icon: Settings,
              label: 'Settings',
              onClick: () => navigate('/settings'),
              color: 'warning',
            },
          ]}
        />
        
        {/* Wallet */}
        <WalletCard />

        {/* Referral Stats */}
        <ReferralStatsCard userId={user.id} />

        {/* Loan Limit Promo */}
        <LoanLimitPromoCard userId={user.id} />

        {/* Quick Receipt Form */}
        <QuickReceiptForm userId={user.id} />

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="elevated-card group hover:shadow-glow transition-all duration-300 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-success/5 to-transparent" />
            <CardContent className="pt-6 relative">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-success/20 to-success/5 group-hover:scale-110 transition-transform duration-300">
                  <Banknote className="h-5 w-5 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground font-medium">Total Rent Received</p>
                  <p className="metric-value text-2xl text-success truncate">
                    {formatUGX(totalReceived)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="elevated-card group hover:shadow-glow transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:scale-110 transition-transform duration-300">
                  <Building className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground font-medium">Payments Received</p>
                  <p className="metric-value text-2xl">{payments.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Card */}
        <Card className="elevated-card border-success/20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-success/5 via-transparent to-primary/5" />
          <CardContent className="pt-6 relative">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-success/20 to-success/5">
                <CheckCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Rent Payments</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You receive rent payments directly from the platform when a tenant's request is funded by a supporter.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment History */}
        <Card className="elevated-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <History className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-lg font-semibold">Payment History</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono">
              {payments.length} total
            </Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-8">
                <Banknote className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No payments received yet.</p>
                <p className="text-sm text-muted-foreground/70">Payments will appear here when tenants have their rent facilitated.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((payment, index) => (
                  <div 
                    key={payment.id} 
                    className="group flex items-center justify-between p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 border border-border/50 hover:border-success/30 transition-all duration-200"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-success/10 group-hover:scale-110 transition-transform duration-200">
                        <TrendingUp className="h-4 w-4 text-success" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-semibold text-success">{formatUGX(Number(payment.amount))}</p>
                        <p className="text-sm text-muted-foreground">
                          {payment.description || 'Rent payment'}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">
                      {new Date(payment.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      
      <FloatingActionButton
        actions={[
          {
            icon: Receipt,
            label: 'My Receipts',
            onClick: () => navigate('/my-receipts'),
          },
          {
            icon: History,
            label: 'Payment History',
            onClick: () => document.getElementById('payment-history')?.scrollIntoView({ behavior: 'smooth' }),
          },
          {
            icon: Wallet,
            label: 'View Wallet',
            onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
          },
        ]}
      />
      
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
