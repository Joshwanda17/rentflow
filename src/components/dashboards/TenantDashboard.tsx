import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  Home, 
  Receipt, 
  ShoppingBag, 
  Share2, 
  History, 
  Settings, 
  Calculator, 
  CreditCard,
  Banknote,
  LogOut,
  Users,
  Calendar
} from 'lucide-react';
import RentCalculator from '@/components/tenant/RentCalculator';
import RentRequestForm from '@/components/tenant/RentRequestForm';
import RoleSwitcher from '@/components/RoleSwitcher';
import { useToast } from '@/hooks/use-toast';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import WelileLogo from '@/components/WelileLogo';
import { DashboardReceiptPrompt } from '@/components/receipts/DashboardReceiptPrompt';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { NotificationBell } from '@/components/NotificationBell';
import { TenantDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { FoodShoppingLoansSection } from '@/components/loans/FoodShoppingLoansSection';
import { FoodReceiptPromoCard } from '@/components/FoodReceiptPromoCard';
import { PullToRefresh } from '@/components/PullToRefresh';
import { PayLandlordDialog } from '@/components/wallet/PayLandlordDialog';
import { ShareAppButton } from '@/components/ShareAppButton';

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
  const [showCalculator, setShowCalculator] = useState(false);
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

  if (loading) {
    return <TenantDashboardSkeleton />;
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
              <WelileLogo showText={false} />
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
              
              {/* Menu Button with all actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white/90 hover:text-white hover:bg-white/10">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-background border shadow-lg z-50">
                  <DropdownMenuItem onClick={() => setShowPayLandlord(true)} className="gap-3 cursor-pointer">
                    <Home className="h-4 w-4" />
                    Pay Rent
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/my-receipts')} className="gap-3 cursor-pointer">
                    <Receipt className="h-4 w-4" />
                    My Receipts
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/my-loans')} className="gap-3 cursor-pointer">
                    <Banknote className="h-4 w-4" />
                    My Loans
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/marketplace')} className="gap-3 cursor-pointer">
                    <ShoppingBag className="h-4 w-4" />
                    Marketplace
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/transactions')} className="gap-3 cursor-pointer">
                    <History className="h-4 w-4" />
                    Transaction History
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/payment-schedule')} className="gap-3 cursor-pointer">
                    <Calendar className="h-4 w-4" />
                    Payment Schedule
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
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
              {profile?.full_name || 'Welcome'}
            </h2>
            <p className="text-sm text-muted-foreground truncate">
              Tap to view profile
            </p>
          </div>
          {addRoleComponent}
        </button>

        {/* PRIORITY 1: Receipt Submission Prompt */}
        <DashboardReceiptPrompt userId={user.id} />

        {/* Food Shopping Loans */}
        <FoodShoppingLoansSection />

        {/* Calculator Section - Only show when triggered */}
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
              }}
            />
          </div>
        )}
      </main>
      
      {/* Floating Action Button - Pay Rent */}
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
