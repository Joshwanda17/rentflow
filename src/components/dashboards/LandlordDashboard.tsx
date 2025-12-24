import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Banknote, Building, CheckCircle, Settings } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white text-gray-900">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
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

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-success/10">
                  <Banknote className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Rent Received</p>
                  <p className="text-xl font-mono font-semibold text-success">
                    {formatUGX(totalReceived)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Building className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payments Received</p>
                  <p className="text-xl font-mono font-semibold">{payments.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info */}
        <Card className="glass-card border-success/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-success mt-1" />
              <div>
                <p className="font-medium">Rent Payments</p>
                <p className="text-sm text-muted-foreground">
                  You receive rent payments directly from the platform when a tenant's request is funded by a supporter.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment History */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : payments.length === 0 ? (
              <p className="text-muted-foreground">
                No payments received yet. Payments will appear here when tenants have their rent facilitated.
              </p>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div 
                    key={payment.id} 
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                  >
                    <div>
                      <p className="font-medium text-success">{formatUGX(Number(payment.amount))}</p>
                      <p className="text-sm text-muted-foreground">
                        {payment.description || 'Rent payment'}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(payment.created_at).toLocaleDateString()}
                    </p>
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
