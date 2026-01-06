import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  LogOut, Wallet, TrendingUp, Settings, Plus, 
  Menu, Receipt, History, Share2, Users, Coins,
  BarChart3, FileText
} from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import RoleSwitcher from '@/components/RoleSwitcher';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import WelileLogo from '@/components/WelileLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { WalletCard } from '@/components/wallet/WalletCard';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { NotificationBell } from '@/components/NotificationBell';
import { SupporterDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';
import { ShareAppButton } from '@/components/ShareAppButton';
import { InvestmentCalculator } from '@/components/supporter/InvestmentCalculator';
import { InvestmentAccountCard, InvestmentAccount } from '@/components/supporter/InvestmentAccountCard';
import { CreateAccountDialog } from '@/components/supporter/CreateAccountDialog';
import { TenantsNeedingRent } from '@/components/supporter/TenantsNeedingRent';
import { InvestmentGoals, InvestmentGoal } from '@/components/supporter/InvestmentGoals';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  tenant_name?: string;
}

interface FundedRequest {
  id: string;
  rent_amount: number;
  duration_days: number;
  status: string;
  funded_at: string;
}

export default function SupporterDashboard({ 
  user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent 
}: SupporterDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [availableRequests, setAvailableRequests] = useState<AvailableRequest[]>([]);
  const [fundedRequests, setFundedRequests] = useState<FundedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const { toast } = useToast();

  // Investment accounts (stored in localStorage for now)
  const [accounts, setAccounts] = useState<InvestmentAccount[]>(() => {
    const saved = localStorage.getItem(`supporter_accounts_${user.id}`);
    if (saved) return JSON.parse(saved);
    return [{
      id: 'default',
      name: 'Main Portfolio',
      balance: 0,
      invested: 0,
      returns: 0,
      color: 'blue',
      isDefault: true,
    }];
  });

  // Investment goals (stored in localStorage)
  const [goals, setGoals] = useState<InvestmentGoal[]>(() => {
    const saved = localStorage.getItem(`supporter_goals_${user.id}`);
    if (saved) return JSON.parse(saved);
    return [];
  });

  useEffect(() => {
    localStorage.setItem(`supporter_accounts_${user.id}`, JSON.stringify(accounts));
  }, [accounts, user.id]);

  useEffect(() => {
    localStorage.setItem(`supporter_goals_${user.id}`, JSON.stringify(goals));
  }, [goals, user.id]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const { data: available } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, duration_days, status, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: true });
    
    const { data: funded } = await supabase
      .from('rent_requests')
      .select('id, rent_amount, duration_days, status, funded_at')
      .eq('supporter_id', user.id)
      .order('funded_at', { ascending: false });
    
    setAvailableRequests(available || []);
    setFundedRequests(funded || []);

    // Update accounts with actual funded data
    if (funded && funded.length > 0) {
      const totalInvested = funded.reduce((sum, r) => sum + Number(r.rent_amount), 0);
      const totalReturns = funded
        .filter(r => r.status === 'completed')
        .reduce((sum, r) => sum + calculateSupporterReward(Number(r.rent_amount)), 0);
      
      setAccounts(prev => prev.map(acc => 
        acc.isDefault 
          ? { ...acc, invested: totalInvested, returns: totalReturns }
          : acc
      ));
    }

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

  const handleCreateAccount = (name: string, color: string) => {
    const newAccount: InvestmentAccount = {
      id: crypto.randomUUID(),
      name,
      balance: 0,
      invested: 0,
      returns: 0,
      color,
    };
    setAccounts(prev => [...prev, newAccount]);
    toast({ title: 'Account Created', description: `${name} has been created` });
  };

  const handleDeleteAccount = (id: string) => {
    setAccounts(prev => prev.filter(acc => acc.id !== id));
    toast({ title: 'Account Deleted' });
  };

  // Goal handlers
  const handleAddGoal = (goal: Omit<InvestmentGoal, 'id' | 'currentAmount' | 'createdAt'>) => {
    const newGoal: InvestmentGoal = {
      ...goal,
      id: crypto.randomUUID(),
      currentAmount: expectedRewards,
      createdAt: new Date().toISOString(),
    };
    setGoals(prev => [...prev, newGoal]);
    toast({ title: 'Goal Created', description: `"${goal.name}" has been set` });
  };

  const handleUpdateGoal = (id: string, updates: Partial<InvestmentGoal>) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    toast({ title: 'Goal Updated' });
  };

  const handleDeleteGoal = (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
    toast({ title: 'Goal Deleted' });
  };

  const totalFunded = fundedRequests.reduce((sum, r) => sum + Number(r.rent_amount), 0);
  const expectedRewards = fundedRequests
    .filter(r => r.status !== 'completed')
    .reduce((sum, r) => sum + calculateSupporterReward(Number(r.rent_amount)), 0);
  const completedRewards = fundedRequests
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + calculateSupporterReward(Number(r.rent_amount)), 0);
  const activeFundings = fundedRequests.filter(r => r.status !== 'completed').length;

  // Update goal progress when earnings change
  useEffect(() => {
    if (goals.length > 0) {
      setGoals(prev => prev.map(g => ({ ...g, currentAmount: completedRewards })));
    }
  }, [completedRewards]);

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
            
            <div className="flex items-center gap-1">
              <ShareAppButton />
              <NotificationBell />
              <ThemeToggle />
              
              {/* Menu Button - Contains receipts and other items */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => navigate('/my-receipts')}>
                    <Receipt className="h-4 w-4 mr-2" />
                    My Receipts
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/transactions')}>
                    <History className="h-4 w-4 mr-2" />
                    Transaction History
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/referrals')}>
                    <Share2 className="h-4 w-4 mr-2" />
                    Referrals
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/benefits')}>
                    <Coins className="h-4 w-4 mr-2" />
                    Benefits
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/my-loans')}>
                    <FileText className="h-4 w-4 mr-2" />
                    My Loans
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  {addRoleComponent}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 animate-fade-in">
        {/* Welcome Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Investor Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your investments • 15% monthly ROI
            </p>
          </div>
          <Badge variant="outline" className="hidden md:flex gap-1 px-3 py-1">
            <TrendingUp className="h-3.5 w-3.5 text-success" />
            <span className="font-medium">{activeFundings} Active</span>
          </Badge>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="elevated-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Invested</p>
                <p className="font-bold text-foreground truncate">{formatUGX(totalFunded)}</p>
              </div>
            </div>
          </Card>
          <Card className="elevated-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Expected</p>
                <p className="font-bold text-success truncate">{formatUGX(expectedRewards)}</p>
              </div>
            </div>
          </Card>
          <Card className="elevated-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Users className="h-4 w-4 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tenants</p>
                <p className="font-bold text-foreground">{availableRequests.length} waiting</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Investment Accounts Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Investment Accounts</h2>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setShowCreateAccount(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              New Account
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <InvestmentAccountCard
                key={account.id}
                account={account}
                onDelete={handleDeleteAccount}
                onEdit={(id) => toast({ title: 'Edit coming soon' })}
                onFund={() => document.getElementById('tenants-section')?.scrollIntoView({ behavior: 'smooth' })}
              />
            ))}
          </div>
        </div>

        {/* Investment Goals */}
        <InvestmentGoals
          goals={goals}
          onAddGoal={handleAddGoal}
          onUpdateGoal={handleUpdateGoal}
          onDeleteGoal={handleDeleteGoal}
          totalEarnings={completedRewards}
          monthlyEarnings={expectedRewards}
        />

        {/* Wallet */}
        <WalletCard />

        {/* Investment Calculator */}
        <InvestmentCalculator />

        {/* Tenants Needing Rent */}
        <div id="tenants-section">
          <TenantsNeedingRent
            requests={availableRequests}
            onFund={fundRequest}
            loading={loading}
          />
        </div>

        {/* My Funded Tenants */}
        <Card className="elevated-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-success/20 to-success/10">
                  <TrendingUp className="h-5 w-5 text-success" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold">My Funded Tenants</CardTitle>
                  <p className="text-xs text-muted-foreground">Track your investment returns</p>
                </div>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {fundedRequests.length} total
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {fundedRequests.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-4 rounded-full bg-muted/50 w-fit mx-auto mb-4">
                  <Wallet className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground font-medium">No investments yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Fund tenants above to start earning</p>
              </div>
            ) : (
              <div className="space-y-2">
                {fundedRequests.slice(0, 5).map((request, index) => {
                  const reward = calculateSupporterReward(Number(request.rent_amount));
                  const statusColor = request.status === 'completed' ? 'success' : 
                                     request.status === 'disbursed' ? 'primary' : 'warning';
                  return (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full bg-${statusColor}`} />
                        <div>
                          <p className="font-medium">{formatUGX(Number(request.rent_amount))}</p>
                          <p className="text-xs text-muted-foreground">{request.duration_days} days</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-success">+{formatUGX(reward)}</p>
                        <Badge variant="secondary" className="text-[10px]">
                          {request.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
                {fundedRequests.length > 5 && (
                  <Button 
                    variant="ghost" 
                    className="w-full mt-2"
                    onClick={() => navigate('/transactions')}
                  >
                    View All ({fundedRequests.length})
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <CreateAccountDialog
        open={showCreateAccount}
        onOpenChange={setShowCreateAccount}
        onCreateAccount={handleCreateAccount}
      />
      
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
