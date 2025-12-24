import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Wallet, TrendingUp, HandCoins } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Funded</p>
                  <p className="text-xl font-mono font-semibold">{formatUGX(totalFunded)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-success/10">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expected Rewards</p>
                  <p className="text-xl font-mono font-semibold text-success">
                    {formatUGX(expectedRewards)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-warning/10">
                  <HandCoins className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Fundings</p>
                  <p className="text-xl font-mono font-semibold">
                    {fundedRequests.filter(r => r.status !== 'completed').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Card */}
        <Card className="glass-card border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-primary mt-1" />
              <div>
                <p className="font-medium">Earn 15% Returns</p>
                <p className="text-sm text-muted-foreground">
                  Fund approved rent requests and earn 15% reward when the tenant completes repayment.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Available Requests */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Available Rent Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : availableRequests.length === 0 ? (
              <p className="text-muted-foreground">
                No approved requests available for funding at the moment.
              </p>
            ) : (
              <div className="space-y-3">
                {availableRequests.map((request) => {
                  const reward = calculateSupporterReward(Number(request.rent_amount));
                  return (
                    <div 
                      key={request.id} 
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                    >
                      <div>
                        <p className="font-medium">{formatUGX(Number(request.rent_amount))}</p>
                        <p className="text-sm text-muted-foreground">
                          {request.duration_days} days • Reward: {formatUGX(reward)}
                        </p>
                      </div>
                      <Button 
                        size="sm"
                        onClick={() => fundRequest(request.id, Number(request.rent_amount))}
                      >
                        Fund Request
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funded Requests */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">My Funded Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {fundedRequests.length === 0 ? (
              <p className="text-muted-foreground">You haven't funded any requests yet.</p>
            ) : (
              <div className="space-y-3">
                {fundedRequests.map((request) => (
                  <div 
                    key={request.id} 
                    className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                  >
                    <div>
                      <p className="font-medium">{formatUGX(Number(request.rent_amount))}</p>
                      <p className="text-sm text-muted-foreground">
                        Reward: {formatUGX(calculateSupporterReward(Number(request.rent_amount)))}
                      </p>
                    </div>
                    <Badge className={
                      request.status === 'completed' 
                        ? 'bg-success/20 text-success' 
                        : 'bg-primary/20 text-primary'
                    }>
                      {request.status}
                    </Badge>
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
