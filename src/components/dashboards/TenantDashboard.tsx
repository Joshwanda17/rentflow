import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Plus, Calculator, CreditCard, Clock, Settings, Sparkles, History, ArrowRight, FileText, Wallet, Receipt, Banknote, Calendar, ShoppingBag, Send, QrCode, Home } from 'lucide-react';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import RentCalculator from '@/components/tenant/RentCalculator';
import RentRequestForm from '@/components/tenant/RentRequestForm';
import RepaymentSection from '@/components/tenant/RepaymentSection';
import LoanProgressWidget from '@/components/tenant/LoanProgressWidget';
import { RentDiscountWidget } from '@/components/tenant/RentDiscountWidget';
import RoleSwitcher from '@/components/RoleSwitcher';
import { formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
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
import { TenantDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { MarketplaceSection } from '@/components/marketplace/MarketplaceSection';
import { LoanProductsSection } from '@/components/loans/LoanProductsSection';
import { QuickReceiptForm } from '@/components/receipts/QuickReceiptForm';
import { LoanLimitPromoCard } from '@/components/LoanLimitPromoCard';
import { QuickActions } from '@/components/QuickActions';
import { StatusIndicator } from '@/components/StatusIndicator';
import { SwipeableRow } from '@/components/SwipeableRow';
import { Eye } from 'lucide-react';
import { PullToRefresh } from '@/components/PullToRefresh';
import { PayLandlordDialog } from '@/components/wallet/PayLandlordDialog';

interface TenantDashboardProps {
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
  duration_days: number;
  total_repayment: number;
  daily_repayment: number;
  status: string;
  created_at: string;
  disbursed_at: string | null;
}

interface Repayment {
  id: string;
  amount: number;
  payment_date: string;
  created_at: string;
  rent_request_id: string;
}

export default function TenantDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: TenantDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [showCalculator, setShowCalculator] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [rentRequests, setRentRequests] = useState<RentRequest[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPayLandlord, setShowPayLandlord] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const { data: requests } = await supabase
      .from('rent_requests')
      .select('*')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false });
    
    const { data: payments } = await supabase
      .from('repayments')
      .select('*')
      .eq('tenant_id', user.id)
      .order('payment_date', { ascending: false });
    
    setRentRequests(requests || []);
    setRepayments(payments || []);
    setLoading(false);
  };

  const activeRequest = rentRequests.find(r => ['approved', 'funded', 'disbursed'].includes(r.status || ''));
  const activeRepayments = activeRequest 
    ? repayments.filter(r => r.rent_request_id === activeRequest.id)
    : [];
  const totalRepaid = activeRepayments.reduce((sum, r) => sum + Number(r.amount), 0);
  const remainingBalance = activeRequest ? Number(activeRequest.total_repayment) - totalRepaid : 0;

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
    return <TenantDashboardSkeleton />;
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

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 animate-fade-in">
        <AppBreadcrumb />
        
        {/* Welcome Section - Simplified for mobile */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Hi{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''} 👋
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
              Your rent & payments
            </p>
          </div>
        </div>
        
        {/* Quick Actions - Large icon buttons */}
        <QuickActions
          actions={[
            {
              icon: Home,
              label: 'Pay Rent',
              onClick: () => setShowPayLandlord(true),
              color: 'success',
            },
            {
              icon: Receipt,
              label: 'Receipts',
              onClick: () => navigate('/my-receipts'),
              color: 'warning',
            },
            {
              icon: Banknote,
              label: 'My Loans',
              onClick: () => navigate('/my-loans'),
              color: 'primary',
            },
            {
              icon: ShoppingBag,
              label: 'Shop',
              onClick: () => navigate('/marketplace'),
              color: 'primary',
            },
          ]}
        />

        {/* Wallet */}
        <WalletCard />

        {/* Rent Discount Widget - Shows monthly discount from receipts */}
        <RentDiscountWidget userId={user.id} />

        {/* Loan Limit Promo */}
        <LoanLimitPromoCard userId={user.id} />

        {/* Quick Receipt Form */}
        <QuickReceiptForm userId={user.id} />

        {/* Quick Stats - Larger, icon-focused cards */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <button 
            onClick={() => navigate('/transactions')}
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-border bg-card hover:bg-accent/30 active:scale-95 transition-all min-h-[90px]"
          >
            <div className="p-2.5 rounded-xl bg-primary/10 mb-2">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <p className="text-lg sm:text-xl font-bold tabular-nums">
              {remainingBalance >= 1000000 ? `${(remainingBalance / 1000000).toFixed(1)}M` : 
               remainingBalance >= 1000 ? `${(remainingBalance / 1000).toFixed(0)}K` : remainingBalance}
            </p>
            <p className="text-[10px] text-muted-foreground font-medium">Balance</p>
          </button>

          <button 
            onClick={() => navigate('/transactions')}
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-border bg-card hover:bg-accent/30 active:scale-95 transition-all min-h-[90px]"
          >
            <div className="p-2.5 rounded-xl bg-success/10 mb-2">
              <Calculator className="h-6 w-6 text-success" />
            </div>
            <p className="text-lg sm:text-xl font-bold text-success tabular-nums">
              {totalRepaid >= 1000000 ? `${(totalRepaid / 1000000).toFixed(1)}M` : 
               totalRepaid >= 1000 ? `${(totalRepaid / 1000).toFixed(0)}K` : totalRepaid}
            </p>
            <p className="text-[10px] text-muted-foreground font-medium">Paid</p>
          </button>

          <button 
            onClick={() => navigate('/payment-schedule')}
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-border bg-card hover:bg-accent/30 active:scale-95 transition-all min-h-[90px]"
          >
            <div className="p-2.5 rounded-xl bg-warning/10 mb-2">
              <Clock className="h-6 w-6 text-warning" />
            </div>
            <p className="text-lg sm:text-xl font-bold tabular-nums">
              {activeRequest ? (
                Number(activeRequest.daily_repayment) >= 1000 
                  ? `${(Number(activeRequest.daily_repayment) / 1000).toFixed(0)}K` 
                  : Number(activeRequest.daily_repayment)
              ) : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground font-medium">Daily</p>
          </button>
        </div>

        {/* Calculator Section */}
        {showCalculator && (
          <div className="animate-fade-in">
            <RentCalculator 
              onProceed={() => {
                setShowCalculator(false);
                setShowRequestForm(true);
              }}
            />
          </div>
        )}

        {/* Request Form */}
        {showRequestForm && (
          <div className="animate-fade-in">
            <RentRequestForm 
              userId={user.id}
              onSuccess={() => {
                setShowRequestForm(false);
                fetchData();
                toast({
                  title: 'Request Submitted',
                  description: 'Your rent request has been submitted for approval'
                });
              }}
              onCancel={() => {
                setShowRequestForm(false);
                setShowCalculator(true);
              }}
            />
          </div>
        )}

        {/* Action Button - Larger touch target */}
        {!showCalculator && !showRequestForm && (
          <Button 
            onClick={() => setShowCalculator(true)}
            className="w-full gap-2 h-12 text-base"
            size="lg"
          >
            <Plus className="h-5 w-5" />
            New Request
            <ArrowRight className="h-5 w-5" />
          </Button>
        )}

        {/* Repayment Section */}
        {!showCalculator && !showRequestForm && (
          <RepaymentSection
            userId={user.id}
            activeRequest={activeRequest}
            repayments={repayments}
            onRepaymentSuccess={fetchData}
          />
        )}

        {/* Loan Progress Widget */}
        <LoanProgressWidget userId={user.id} />

        {/* Available Loans */}
        <LoanProductsSection />

        {/* Marketplace */}
        <MarketplaceSection />

        {/* Rent Requests History - Simplified */}
        <Card className="elevated-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <History className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base font-semibold">History</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {rentRequests.length}
            </Badge>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : rentRequests.length === 0 ? (
              <div className="text-center py-6">
                <Calculator className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No requests yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rentRequests.slice(0, 5).map((request) => (
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
                    <button 
                      onClick={() => navigate('/transactions')}
                      className="w-full flex items-center justify-between p-3 bg-secondary/30 hover:bg-secondary/50 border border-border/50 active:scale-[0.98] transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <StatusIndicator status={request.status} size="md" />
                        <div className="text-left">
                          <p className="font-bold text-sm">{formatUGX(Number(request.rent_amount))}</p>
                          <p className="text-[11px] text-muted-foreground">{request.duration_days}d</p>
                        </div>
                      </div>
                    </button>
                  </SwipeableRow>
                ))}
                {rentRequests.length > 5 && (
                  <Button 
                    variant="ghost" 
                    className="w-full text-sm"
                    onClick={() => navigate('/transactions')}
                  >
                    See all {rentRequests.length} requests
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      
      <FloatingActionButton
        actions={[
          {
            icon: Home,
            label: 'Pay Rent',
            onClick: () => setShowPayLandlord(true),
          },
          {
            icon: Calculator,
            label: 'Calculate',
            onClick: () => setShowCalculator(!showCalculator),
          },
          {
            icon: Receipt,
            label: 'Receipts',
            onClick: () => navigate('/my-receipts'),
          },
          {
            icon: Banknote,
            label: 'Loans',
            onClick: () => navigate('/my-loans'),
          },
          {
            icon: Calendar,
            label: 'Schedule',
            onClick: () => navigate('/payment-schedule'),
          },
        ]}
      />
      
      <PayLandlordDialog open={showPayLandlord} onOpenChange={setShowPayLandlord} />
      
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
