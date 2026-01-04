import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Plus, Calculator, CreditCard, Clock, Settings, History, ArrowRight, Receipt, Banknote, Calendar, ShoppingBag, Home, Share2, MoreVertical, Search, Camera } from 'lucide-react';
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
import { ReferralStatsCard } from '@/components/ReferralStatsCard';
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

  if (loading) {
    return <TenantDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await fetchData();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-background pb-20 md:pb-0">
      {/* WhatsApp-style Header */}
      <header className="sticky top-0 z-50 wa-header shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white">Welile</h1>
              <RoleSwitcher
                currentRole={currentRole} 
                availableRoles={availableRoles} 
                onRoleChange={onRoleChange} 
              />
            </div>
            
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="text-white/90 hover:text-white hover:bg-white/10">
                <Camera className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white/90 hover:text-white hover:bg-white/10">
                <Search className="h-5 w-5" />
              </Button>
              <NotificationBell />
              <ThemeToggle />
              <Button variant="ghost" size="icon" className="text-white/90 hover:text-white hover:bg-white/10" onClick={() => navigate('/settings')}>
                <MoreVertical className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Quick Action Tabs */}
        <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto hide-scrollbar">
          <button 
            onClick={() => setShowPayLandlord(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-full text-white text-sm font-medium whitespace-nowrap transition-colors"
          >
            <Home className="h-4 w-4" />
            Pay Rent
          </button>
          <button 
            onClick={() => navigate('/my-receipts')}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-full text-white text-sm font-medium whitespace-nowrap transition-colors"
          >
            <Receipt className="h-4 w-4" />
            Receipts
          </button>
          <button 
            onClick={() => navigate('/marketplace')}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-full text-white text-sm font-medium whitespace-nowrap transition-colors"
          >
            <ShoppingBag className="h-4 w-4" />
            Shop
          </button>
          <button 
            onClick={() => navigate('/benefits')}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-full text-white text-sm font-medium whitespace-nowrap transition-colors"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 animate-fade-in">
        {/* User Profile Card */}
        <div className="wa-list-item rounded-xl border border-border/50 shadow-sm">
          <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="md" />
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-base truncate">
              {profile?.full_name || 'Welcome'}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              Your rent & payments dashboard
            </p>
          </div>
          <div className="flex items-center">
            {addRoleComponent}
          </div>
        </div>

        {/* Wallet */}
        <WalletCard />

        {/* Quick Stats - WhatsApp style */}
        <div className="grid grid-cols-3 gap-3">
          <button 
            onClick={() => navigate('/transactions')}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-card border border-border/50 hover:bg-muted/50 active:scale-[0.98] transition-all"
          >
            <div className="p-2.5 rounded-full bg-primary/10 mb-2">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <p className="text-lg font-bold tabular-nums">
              {remainingBalance >= 1000000 ? `${(remainingBalance / 1000000).toFixed(1)}M` : 
               remainingBalance >= 1000 ? `${(remainingBalance / 1000).toFixed(0)}K` : remainingBalance}
            </p>
            <p className="text-[11px] text-muted-foreground font-medium">Balance</p>
          </button>

          <button 
            onClick={() => navigate('/transactions')}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-card border border-border/50 hover:bg-muted/50 active:scale-[0.98] transition-all"
          >
            <div className="p-2.5 rounded-full bg-success/10 mb-2">
              <Calculator className="h-5 w-5 text-success" />
            </div>
            <p className="text-lg font-bold text-success tabular-nums">
              {totalRepaid >= 1000000 ? `${(totalRepaid / 1000000).toFixed(1)}M` : 
               totalRepaid >= 1000 ? `${(totalRepaid / 1000).toFixed(0)}K` : totalRepaid}
            </p>
            <p className="text-[11px] text-muted-foreground font-medium">Paid</p>
          </button>

          <button 
            onClick={() => navigate('/payment-schedule')}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-card border border-border/50 hover:bg-muted/50 active:scale-[0.98] transition-all"
          >
            <div className="p-2.5 rounded-full bg-warning/10 mb-2">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <p className="text-lg font-bold tabular-nums">
              {activeRequest ? (
                Number(activeRequest.daily_repayment) >= 1000 
                  ? `${(Number(activeRequest.daily_repayment) / 1000).toFixed(0)}K` 
                  : Number(activeRequest.daily_repayment)
              ) : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground font-medium">Daily</p>
          </button>
        </div>

        {/* Rent Discount Widget */}
        <RentDiscountWidget userId={user.id} />

        {/* Referral Stats */}
        <ReferralStatsCard userId={user.id} />

        {/* Loan Limit Promo */}
        <LoanLimitPromoCard userId={user.id} />

        {/* Quick Receipt Form */}
        <QuickReceiptForm userId={user.id} />

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

        {/* Action Button */}
        {!showCalculator && !showRequestForm && (
          <Button 
            onClick={() => setShowCalculator(true)}
            className="w-full gap-2 h-12 text-base rounded-xl"
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

        {/* Rent Requests History */}
        <Card className="elevated-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <History className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-base font-semibold">History</CardTitle>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {rentRequests.length}
            </Badge>
          </CardHeader>
          <CardContent className="pt-0">
            {rentRequests.length === 0 ? (
              <div className="text-center py-8">
                <Calculator className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
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
                      className="w-full wa-list-item rounded-lg"
                    >
                      <StatusIndicator status={request.status} size="md" />
                      <div className="flex-1 text-left">
                        <p className="font-semibold text-sm">{formatUGX(Number(request.rent_amount))}</p>
                        <p className="text-xs text-muted-foreground">{request.duration_days} days</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </SwipeableRow>
                ))}
                {rentRequests.length > 5 && (
                  <Button 
                    variant="ghost" 
                    className="w-full text-sm text-primary"
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
      
      {/* WhatsApp-style FAB */}
      <button 
        onClick={() => setShowPayLandlord(true)}
        className="wa-fab"
      >
        <Home className="h-6 w-6" />
      </button>
      
      <PayLandlordDialog open={showPayLandlord} onOpenChange={setShowPayLandlord} />
      
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
