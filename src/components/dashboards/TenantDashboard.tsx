import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Plus, Calculator, CreditCard, Clock, Settings, Sparkles, History, ArrowRight, FileText, Wallet, Receipt, Banknote, Calendar } from 'lucide-react';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import RentCalculator from '@/components/tenant/RentCalculator';
import RentRequestForm from '@/components/tenant/RentRequestForm';
import RepaymentSection from '@/components/tenant/RepaymentSection';
import LoanProgressWidget from '@/components/tenant/LoanProgressWidget';
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
              Manage your rent requests and repayments
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          </div>
        </div>
        
        {/* Wallet */}
        <WalletCard />

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="elevated-card group hover:shadow-glow transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 group-hover:scale-110 transition-transform duration-300">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground font-medium">Active Balance</p>
                  <p className="metric-value text-xl truncate">
                    {formatUGX(remainingBalance)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="elevated-card group hover:shadow-glow transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-success/20 to-success/5 group-hover:scale-110 transition-transform duration-300">
                  <Calculator className="h-5 w-5 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground font-medium">Total Repaid</p>
                  <p className="metric-value text-xl text-success truncate">
                    {formatUGX(totalRepaid)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="elevated-card group hover:shadow-glow transition-all duration-300">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-warning/20 to-warning/5 group-hover:scale-110 transition-transform duration-300">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground font-medium">Daily Payment</p>
                  <p className="metric-value text-xl truncate">
                    {activeRequest ? formatUGX(Number(activeRequest.daily_repayment)) : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
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

        {/* Action Button */}
        {!showCalculator && !showRequestForm && (
          <Button 
            onClick={() => setShowCalculator(true)}
            className="w-full md:w-auto gap-2"
            size="lg"
          >
            <Plus className="h-4 w-4" />
            New Rent Request
            <ArrowRight className="h-4 w-4" />
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <History className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-lg font-semibold">My Rent Requests</CardTitle>
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
                <Calculator className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No rent requests yet.</p>
                <p className="text-sm text-muted-foreground/70">Use the calculator above to get started.</p>
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
                        {request.duration_days} days • Daily: {formatUGX(Number(request.daily_repayment))}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <Badge variant={getStatusColor(request.status)}>
                        {request.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {new Date(request.created_at).toLocaleDateString()}
                      </p>
                    </div>
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
            icon: Calculator,
            label: 'Rent Calculator',
            onClick: () => setShowCalculator(!showCalculator),
          },
          {
            icon: FileText,
            label: 'New Request',
            onClick: () => setShowRequestForm(true),
          },
          {
            icon: Receipt,
            label: 'My Receipts',
            onClick: () => navigate('/my-receipts'),
          },
          {
            icon: Banknote,
            label: 'My Loans',
            onClick: () => navigate('/my-loans'),
          },
          {
            icon: Calendar,
            label: 'Payment Schedule',
            onClick: () => navigate('/payment-schedule'),
          },
          {
            icon: History,
            label: 'Transaction History',
            onClick: () => navigate('/transactions'),
          },
        ]}
      />
      
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </div>
  );
}
