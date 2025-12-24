import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Plus, Calculator, CreditCard, Clock, Settings } from 'lucide-react';
import RentCalculator from '@/components/tenant/RentCalculator';
import RentRequestForm from '@/components/tenant/RentRequestForm';
import RepaymentSection from '@/components/tenant/RepaymentSection';
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
      case 'pending': return 'bg-warning/20 text-warning';
      case 'approved': return 'bg-primary/20 text-primary';
      case 'funded': return 'bg-success/20 text-success';
      case 'disbursed': return 'bg-success/20 text-success';
      case 'completed': return 'bg-muted text-muted-foreground';
      case 'rejected': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white text-gray-900">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <WelileLogo showText={false} />
            <RoleSwitcher
              currentRole={currentRole} 
              availableRoles={availableRoles} 
              onRoleChange={onRoleChange} 
            />
          </div>
          <div className="hidden md:flex items-center gap-2">
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
          <div className="md:hidden">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <AppBreadcrumb />
        
        {/* Wallet */}
        <WalletCard />

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <CreditCard className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Balance</p>
                  <p className="text-xl font-mono font-semibold">
                    {formatUGX(remainingBalance)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-success/10">
                  <Calculator className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Repaid</p>
                  <p className="text-xl font-mono font-semibold text-success">
                    {formatUGX(totalRepaid)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-warning/10">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Daily Payment</p>
                  <p className="text-xl font-mono font-semibold">
                    {activeRequest ? formatUGX(Number(activeRequest.daily_repayment)) : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calculator Section */}
        {showCalculator && (
          <RentCalculator 
            onProceed={() => {
              setShowCalculator(false);
              setShowRequestForm(true);
            }}
          />
        )}

        {/* Request Form */}
        {showRequestForm && (
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
        )}

        {/* Action Button */}
        {!showCalculator && !showRequestForm && (
          <Button 
            onClick={() => setShowCalculator(true)}
            className="w-full md:w-auto mb-4"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Rent Request
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

        {/* Rent Requests History */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">My Rent Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : rentRequests.length === 0 ? (
              <p className="text-muted-foreground">No rent requests yet. Use the calculator above to get started.</p>
            ) : (
              <div className="space-y-3">
                {rentRequests.map((request) => (
                  <div 
                    key={request.id} 
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                  >
                    <div>
                      <p className="font-medium">{formatUGX(Number(request.rent_amount))}</p>
                      <p className="text-sm text-muted-foreground">
                        {request.duration_days} days • Daily: {formatUGX(Number(request.daily_repayment))}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge className={getStatusColor(request.status)}>
                        {request.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
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
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </div>
  );
}
