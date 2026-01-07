import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  Users, 
  Coins, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Store, 
  Banknote, 
  Receipt, 
  Share2, 
  Settings, 
  LogOut, 
  History,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Package
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import RoleSwitcher from '@/components/RoleSwitcher';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import WelileLogo from '@/components/WelileLogo';
import { WalletCard } from '@/components/wallet/WalletCard';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { NotificationBell } from '@/components/NotificationBell';
import { AgentDepositDialog } from '@/components/agent/AgentDepositDialog';
import { AgentWithdrawalDialog } from '@/components/agent/AgentWithdrawalDialog';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { AgentDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';
import { FoodReceiptPromoCard } from '@/components/FoodReceiptPromoCard';
import { FoodShoppingLoansSection } from '@/components/loans/FoodShoppingLoansSection';
import { ShareAppButton } from '@/components/ShareAppButton';

interface AgentDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

export default function AgentDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: AgentDashboardProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { totalEarnings, commissionTotal, bonusTotal } = useAgentEarnings();
  const [referralCount, setReferralCount] = useState(0);
  const [tenantsCount, setTenantsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [requestsRes, referralsRes] = await Promise.all([
      supabase
        .from('rent_requests')
        .select('id')
        .eq('agent_id', user.id),
      supabase
        .from('referrals')
        .select('id')
        .eq('referrer_id', user.id)
    ]);
    
    setTenantsCount(requestsRes.data?.length || 0);
    setReferralCount(referralsRes.data?.length || 0);
    setLoading(false);
  };

  if (loading) {
    return <AgentDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await fetchData();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Simplified Header */}
      <header className="sticky top-0 z-50 wa-header shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <WelileLogo />
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
              
              {/* Menu Button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white/90 hover:text-white hover:bg-white/10">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-background border shadow-lg z-50">
                  <DropdownMenuItem onClick={() => setDepositOpen(true)} className="gap-3 cursor-pointer">
                    <ArrowDownCircle className="h-4 w-4" />
                    Deposit for User
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setWithdrawalOpen(true)} className="gap-3 cursor-pointer">
                    <ArrowUpCircle className="h-4 w-4" />
                    Withdraw for User
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/my-receipts')} className="gap-3 cursor-pointer">
                    <Receipt className="h-4 w-4" />
                    My Receipts
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/my-loans')} className="gap-3 cursor-pointer">
                    <Banknote className="h-4 w-4" />
                    My Loans
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/marketplace')} className="gap-3 cursor-pointer">
                    <Store className="h-4 w-4" />
                    My Shop
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/earnings')} className="gap-3 cursor-pointer">
                    <TrendingUp className="h-4 w-4" />
                    Earnings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/transactions')} className="gap-3 cursor-pointer">
                    <History className="h-4 w-4" />
                    Transactions
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/referrals')} className="gap-3 cursor-pointer">
                    <Users className="h-4 w-4" />
                    Referrals
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/benefits')} className="gap-3 cursor-pointer">
                    <Share2 className="h-4 w-4" />
                    Share & Earn
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-3 cursor-pointer">
                    <Settings className="h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => signOut()} className="gap-3 cursor-pointer text-destructive">
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 animate-fade-in">
        {/* User Profile Card - Clickable */}
        <button 
          onClick={() => navigate('/settings')}
          className="w-full wa-list-item rounded-xl border border-border/50 shadow-sm hover:bg-muted/50 active:scale-[0.99] transition-all"
        >
          <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="md" />
          <div className="flex-1 min-w-0 text-left">
            <h2 className="font-semibold text-base truncate">
              {profile?.full_name || 'Agent'}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              Tap to view profile
            </p>
          </div>
          {addRoleComponent}
        </button>

        {/* Wallet Card */}
        <WalletCard />

        {/* Earnings Card - Clickable */}
        <button 
          onClick={() => navigate('/earnings')}
          className="w-full text-left block"
        >
          <Card className="border-2 border-success/30 bg-gradient-to-br from-success/5 via-background to-warning/5 hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-success/20 ring-2 ring-success/30">
                    <Coins className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Your Earnings</h3>
                    <p className="text-sm text-muted-foreground">Tap to view details</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-success/10 border border-success/20 text-center">
                  <p className="text-xl font-bold text-success">{formatUGX(totalEarnings)}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-center">
                  <p className="text-lg font-bold">{tenantsCount}</p>
                  <p className="text-xs text-muted-foreground">Tenants</p>
                </div>
                <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-center">
                  <p className="text-lg font-bold">{referralCount}</p>
                  <p className="text-xs text-muted-foreground">Referrals</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        {/* My Shop Card - Clickable */}
        <button 
          onClick={() => navigate('/marketplace')}
          className="w-full text-left block"
        >
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-success/5 hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/20 ring-2 ring-primary/30">
                    <Store className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg">My Shop</h3>
                      <Badge className="bg-primary/20 text-primary border-primary/30 gap-1">
                        <Package className="h-3 w-3" />
                        Manage
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Tap to manage products & orders</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </button>

        {/* Food Receipt Promo */}
        <FoodReceiptPromoCard userId={user.id} />

        {/* Food Shopping Loans */}
        <FoodShoppingLoansSection />
      </main>
      
      {/* FAB for quick deposit */}
      <button 
        onClick={() => setDepositOpen(true)}
        className="wa-fab"
      >
        <ArrowDownCircle className="h-6 w-6" />
      </button>
      
      <AgentDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <AgentWithdrawalDialog open={withdrawalOpen} onOpenChange={setWithdrawalOpen} />
      
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
