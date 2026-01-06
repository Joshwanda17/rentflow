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
  BarChart3, FileText, Sparkles, ArrowUpRight, Zap
} from 'lucide-react';
import { formatUGX, calculateSupporterReward } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import RoleSwitcher from '@/components/RoleSwitcher';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import WelileLogo from '@/components/WelileLogo';
import { AnimatedThemeToggle } from '@/components/AnimatedThemeToggle';
import { WalletCard } from '@/components/wallet/WalletCard';
import { motion } from 'framer-motion';
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

  // Update goal progress when earnings change - using ref to prevent infinite loops
  useEffect(() => {
    if (goals.length > 0 && !loading) {
      const needsUpdate = goals.some(g => g.currentAmount !== completedRewards);
      if (needsUpdate) {
        setGoals(prev => prev.map(g => ({ ...g, currentAmount: completedRewards })));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedRewards, loading]);

  if (loading) {
    return <SupporterDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await fetchData();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 pb-20 md:pb-0">
      {/* Modern Glassmorphism Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-white/10 shadow-lg shadow-black/5">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div 
                className="relative"
                whileHover={{ scale: 1.05 }}
              >
                <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="sm" />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-background animate-pulse" />
              </motion.div>
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
              <AnimatedThemeToggle />
              
              {/* Menu Button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-white/10">
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 backdrop-blur-xl bg-background/95 border-white/10">
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
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={() => navigate('/my-loans')}>
                    <FileText className="h-4 w-4 mr-2" />
                    My Loans
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  {addRoleComponent}
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Hero Welcome Section */}
        <motion.div 
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-violet-500/15 to-purple-600/20 p-6 border border-white/10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-white/10 to-transparent rounded-full blur-3xl" />
          <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-2xl" />
          
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Investor Portal</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
                Welcome Back! 👋
              </h1>
              <p className="text-muted-foreground text-sm mt-2 font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-warning" />
                Earning 15% monthly on your investments
              </p>
            </div>
            <Badge className="hidden md:flex gap-2 px-4 py-2 bg-success/20 text-success border-success/30 font-bold">
              <TrendingUp className="h-4 w-4" />
              {activeFundings} Active Investments
            </Badge>
          </div>
        </motion.div>

        {/* Quick Stats Bar - Modern Cards */}
        <div className="grid grid-cols-3 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary/15 via-primary/10 to-violet-500/10 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
              <div className="absolute -top-8 -right-8 w-20 h-20 bg-primary/20 rounded-full blur-2xl" />
              <CardContent className="relative p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-violet-500 shadow-lg shadow-primary/30">
                    <Wallet className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Invested</p>
                    <p className="font-black text-foreground truncate text-lg">{formatUGX(totalFunded)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-success/15 via-success/10 to-emerald-500/10 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
              <div className="absolute -top-8 -right-8 w-20 h-20 bg-success/20 rounded-full blur-2xl" />
              <CardContent className="relative p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-success to-emerald-500 shadow-lg shadow-success/30">
                    <ArrowUpRight className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Expected</p>
                    <p className="font-black text-success truncate text-lg">{formatUGX(expectedRewards)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-warning/15 via-warning/10 to-orange-500/10 backdrop-blur-xl shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1">
              <div className="absolute -top-8 -right-8 w-20 h-20 bg-warning/20 rounded-full blur-2xl" />
              <CardContent className="relative p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-warning to-orange-500 shadow-lg shadow-warning/30">
                    <Users className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Waiting</p>
                    <p className="font-black text-foreground text-lg">{availableRequests.length} tenants</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Investment Accounts Section */}
        <motion.div 
          className="space-y-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-black">Investment Accounts</h2>
                <p className="text-xs text-muted-foreground font-medium">Manage your portfolios</p>
              </div>
            </div>
            <Button 
              size="sm" 
              onClick={() => setShowCreateAccount(true)}
              className="gap-2 bg-gradient-to-r from-primary to-violet-500 hover:from-primary/90 hover:to-violet-500/90 shadow-lg shadow-primary/25"
            >
              <Plus className="h-4 w-4" />
              New Portfolio
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
        </motion.div>

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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-success/5 via-background to-emerald-500/5 backdrop-blur-xl shadow-xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-success/10 to-transparent rounded-full blur-3xl" />
            
            <CardHeader className="relative pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <motion.div 
                    className="p-3 rounded-2xl bg-gradient-to-br from-success via-emerald-500 to-green-500 shadow-lg shadow-success/30"
                    whileHover={{ scale: 1.05, rotate: -5 }}
                  >
                    <TrendingUp className="h-5 w-5 text-white" />
                  </motion.div>
                  <div>
                    <CardTitle className="text-xl font-black tracking-tight">Your Portfolio 💼</CardTitle>
                    <p className="text-sm text-muted-foreground font-medium mt-0.5">Track your investment returns</p>
                  </div>
                </div>
                <Badge className="font-mono text-xs bg-success/20 text-success border-success/30 px-3 py-1">
                  <Sparkles className="h-3 w-3 mr-1" />
                  {fundedRequests.length} total
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="relative">
              {fundedRequests.length === 0 ? (
                <div className="text-center py-16">
                  <motion.div 
                    className="p-5 rounded-full bg-gradient-to-br from-success/20 to-success/5 w-fit mx-auto mb-5"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Wallet className="h-10 w-10 text-success/60" />
                  </motion.div>
                  <p className="text-foreground font-bold text-lg">No investments yet 🌱</p>
                  <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                    Fund your first tenant above to start earning 15% monthly returns
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fundedRequests.slice(0, 5).map((request, index) => {
                    const reward = calculateSupporterReward(Number(request.rent_amount));
                    const statusConfig = {
                      completed: { color: 'from-success to-emerald-500', bg: 'bg-success/20', text: 'text-success', label: '✓ Complete' },
                      disbursed: { color: 'from-primary to-violet-500', bg: 'bg-primary/20', text: 'text-primary', label: 'Active' },
                      funded: { color: 'from-warning to-orange-500', bg: 'bg-warning/20', text: 'text-warning', label: 'Funded' },
                    };
                    const status = statusConfig[request.status as keyof typeof statusConfig] || statusConfig.funded;
                    
                    return (
                      <motion.div
                        key={request.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.01, x: 4 }}
                        className="flex items-center justify-between p-4 rounded-2xl bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 hover:border-success/30 transition-all duration-300"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${status.color} flex items-center justify-center shadow-lg`}>
                            <Coins className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-lg">{formatUGX(Number(request.rent_amount))}</p>
                            <p className="text-xs text-muted-foreground font-medium">{request.duration_days} days term</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-success text-lg">+{formatUGX(reward)}</p>
                          <Badge className={`text-[10px] px-2 py-0.5 ${status.bg} ${status.text} border-0`}>
                            {status.label}
                          </Badge>
                        </div>
                      </motion.div>
                    );
                  })}
                  {fundedRequests.length > 5 && (
                    <Button 
                      variant="ghost" 
                      className="w-full mt-3 gap-2 hover:bg-white/10"
                      onClick={() => navigate('/transactions')}
                    >
                      <Sparkles className="h-4 w-4" />
                      View All {fundedRequests.length} Investments
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
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
