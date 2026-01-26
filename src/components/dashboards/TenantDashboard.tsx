import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useOffline } from '@/contexts/OfflineContext';
import { 
  Home, 
  Receipt, 
  ShoppingBag, 
  Share2, 
  History, 
  Banknote,
  Users,
  Calendar,
  Download,
  Wallet,
  CreditCard
} from 'lucide-react';
import RentCalculator from '@/components/tenant/RentCalculator';
import { RentRequestButton } from '@/components/tenant/RentRequestButton';
import RentRequestForm from '@/components/tenant/RentRequestForm';
import { useToast } from '@/hooks/use-toast';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import { DashboardReceiptPrompt } from '@/components/receipts/DashboardReceiptPrompt';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { TenantDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';
import { PayLandlordDialog } from '@/components/wallet/PayLandlordDialog';
import { FloatingShareButton } from '@/components/FloatingShareButton';
import MobileQuickMenu from '@/components/MobileQuickMenu';
import { CollapsibleQuickNav } from '@/components/CollapsibleQuickNav';
import RoleSwitcher from '@/components/RoleSwitcher';
import { WalletCard } from '@/components/wallet/WalletCard';
import { RentAccessLimitCard } from '@/components/tenant/RentAccessLimitCard';
import { PaymentStreakCalendar } from '@/components/tenant/PaymentStreakCalendar';
import { AchievementBadges } from '@/components/tenant/AchievementBadges';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PaymentPartnersDialog from '@/components/payments/PaymentPartnersDialog';
import PaymentPartnersCard from '@/components/payments/PaymentPartnersCard';
import { 
  TenantAgreementButton, 
  TenantAgreementNotice, 
  TenantAgreementModal,
  LockedActionTooltip 
} from '@/components/tenant/agreement';
import { useTenantAgreement } from '@/hooks/useTenantAgreement';
import { RepaymentHistoryDrawer } from '@/components/tenant/RepaymentHistoryDrawer';
import RepaymentSection from '@/components/tenant/RepaymentSection';
import { WelileHomesButton } from '@/components/tenant/WelileHomesButton';
import { InviteFriendsCard } from '@/components/tenant/InviteFriendsCard';

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
  const { isOnline } = useOffline();
  const [showCalculator, setShowCalculator] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [rentRequests, setRentRequests] = useState<RentRequest[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasCachedData, setHasCachedData] = useState(false);
  const [showPayLandlord, setShowPayLandlord] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showPaymentPartners, setShowPaymentPartners] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [isAcceptingAgreement, setIsAcceptingAgreement] = useState(false);
  const [showRepaymentSchedule, setShowRepaymentSchedule] = useState(false);
  const { toast } = useToast();
  const { isAccepted: hasAcceptedTerms, isLoading: agreementLoading, acceptAgreement } = useTenantAgreement();

  const handleAcceptAgreement = async () => {
    setIsAcceptingAgreement(true);
    try {
      return await acceptAgreement();
    } finally {
      setIsAcceptingAgreement(false);
    }
  };
  // Load cached data first for offline support
  useEffect(() => {
    const cached = localStorage.getItem(`tenant_dashboard_${user.id}`);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        setRentRequests(data.rentRequests || []);
        setRepayments(data.repayments || []);
        setHasCachedData(true);
      } catch (e) {
        console.warn('[TenantDashboard] Failed to load cached data');
      }
    }
  }, [user.id]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Skip network fetch if offline and we have cached data
    if (!navigator.onLine && hasCachedData) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    try {
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
      
      const newRentRequests = requests || [];
      const newRepayments = payments || [];
      
      setRentRequests(newRentRequests);
      setRepayments(newRepayments);
      
      // Cache the data for offline use
      localStorage.setItem(`tenant_dashboard_${user.id}`, JSON.stringify({
        rentRequests: newRentRequests,
        repayments: newRepayments,
        timestamp: Date.now()
      }));
      setHasCachedData(true);
    } catch (error) {
      console.error('[TenantDashboard] Error fetching data:', error);
    }
    
    setLoading(false);
  };

  // Only show skeleton if loading AND online AND no cached data
  if (loading && isOnline && !hasCachedData) {
    return <TenantDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await fetchData();
  };

  const menuItems = [
    { icon: Calendar, label: 'Payments', onClick: () => setShowRepaymentSchedule(true) },
    { icon: Home, label: 'Pay Rent', onClick: () => setShowPayLandlord(true) },
    { icon: CreditCard, label: 'Pay Welile', onClick: () => setShowPaymentPartners(true) },
    { icon: Receipt, label: 'My Receipts', onClick: () => navigate('/my-receipts') },
    { icon: Banknote, label: 'My Loans', onClick: () => navigate('/my-loans') },
    { icon: ShoppingBag, label: 'Marketplace', onClick: () => navigate('/marketplace'), separator: true },
    { icon: History, label: 'Transaction History', onClick: () => navigate('/transactions') },
    { icon: Users, label: 'Referrals', onClick: () => navigate('/referrals'), separator: true },
    { icon: Share2, label: 'Share & Earn', onClick: () => navigate('/benefits') },
    { icon: Download, label: 'Install App', onClick: () => navigate('/install') },
  ];

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-background pb-20 md:pb-0">
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <main className="px-4 py-4 space-y-4 animate-fade-in">
        {/* Terms Acceptance Notice - Shows only when not accepted */}
        <TenantAgreementNotice onAcceptClick={() => setShowAgreementModal(true)} />

        {/* Repayment Schedule Button - Prominent placement above profile */}
        <button
          onClick={() => setShowRepaymentSchedule(prev => !prev)}
          className={`w-full overflow-hidden border-2 ${showRepaymentSchedule ? 'border-primary bg-primary/10' : 'border-primary/30 bg-gradient-to-br from-primary/10 via-background to-primary/5'} shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl`}
        >
          <div className="w-full p-4 flex items-center gap-4 hover:bg-primary/5 transition-colors group">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <Calendar className="h-7 w-7 text-primary-foreground" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-bold text-foreground">Repayment Schedule</h3>
              <p className="text-sm text-muted-foreground">
                View payment history, missed & paid days
              </p>
            </div>
            <div className={`h-6 w-6 text-primary transition-transform ${showRepaymentSchedule ? 'rotate-180' : 'group-hover:translate-x-1'}`}>
              {showRepaymentSchedule ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              )}
            </div>
          </div>
        </button>

        {/* Repayment Schedule - Shown when toggled */}
        {showRepaymentSchedule && (
          <div className="animate-fade-in">
            <RepaymentSection 
              userId={user.id}
              activeRequest={rentRequests.find(r => r.status === 'disbursed')}
              repayments={repayments}
              onRepaymentSuccess={fetchData}
            />
          </div>
        )}

        {/* Role Switcher - Prominent placement for multi-role users */}
        {availableRoles.length > 1 && (
          <RoleSwitcher
            currentRole={currentRole}
            availableRoles={availableRoles}
            onRoleChange={onRoleChange}
            variant="prominent"
          />
        )}

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
              Profile Information
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TenantAgreementButton />
            {addRoleComponent}
          </div>
        </button>

        {/* Welile Homes - Turn rent into future home */}
        <WelileHomesButton />

        {/* Rent Access Limit Card - Featured prominently */}
        <RentAccessLimitCard userId={user.id} />

        {/* Prominent Rent Request Button - Right below limit card (locked if terms not accepted) */}
        <LockedActionTooltip isLocked={!hasAcceptedTerms && !agreementLoading}>
          <RentRequestButton userId={user.id} onSuccess={fetchData} />
        </LockedActionTooltip>

        {/* Pay Welile Button - Prominent placement right below Request Rent */}
        <LockedActionTooltip isLocked={!hasAcceptedTerms && !agreementLoading}>
          <button
            onClick={() => hasAcceptedTerms ? setShowPaymentPartners(true) : setShowAgreementModal(true)}
            className="w-full overflow-hidden border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-background to-amber-500/5 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl"
          >
            <div className="w-full p-4 flex items-center gap-4 hover:bg-amber-500/5 transition-colors group">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                <CreditCard className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-bold text-foreground">Pay Welile</h3>
                <p className="text-sm text-muted-foreground">
                  Make payments via Mobile Money
                </p>
              </div>
              <div className="h-6 w-6 text-amber-500 group-hover:translate-x-1 transition-transform">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </div>
          </button>
        </LockedActionTooltip>

        {/* Collapsible Quick Actions */}
        <CollapsibleQuickNav 
          buttonLabel="Quick Actions"
          items={[
            { 
              icon: Home, 
              label: 'Pay Rent', 
              onClick: hasAcceptedTerms ? () => setShowPayLandlord(true) : () => setShowAgreementModal(true), 
              variant: 'primary' 
            },
            { 
              icon: CreditCard, 
              label: 'Pay Welile', 
              onClick: hasAcceptedTerms ? () => setShowPaymentPartners(true) : () => setShowAgreementModal(true), 
              variant: 'warning' 
            },
            { icon: Wallet, label: 'Wallet', onClick: () => setShowWallet(true) },
            { icon: Calendar, label: 'Payments', onClick: () => setShowRepaymentSchedule(prev => !prev) },
            { icon: ShoppingBag, label: 'Shop', onClick: () => navigate('/marketplace'), variant: 'success' },
            { icon: Banknote, label: 'Loans', onClick: () => navigate('/my-loans') },
            { icon: History, label: 'History', onClick: () => navigate('/transactions') },
            { icon: Users, label: 'Referrals', onClick: () => navigate('/referrals') },
            { icon: Share2, label: 'Earn', onClick: () => navigate('/benefits'), variant: 'warning' },
            { icon: Download, label: 'Install App', onClick: () => navigate('/install') },
          ]}
        />

        {/* PRIORITY 1: Receipt Submission Prompt */}
        <DashboardReceiptPrompt userId={user.id} />

        {/* Invite Friends - Easy share widget */}
        <InviteFriendsCard />

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
      
      {/* Floating Action Button - Pay Rent (opens terms if not accepted) */}
      <button 
        type="button"
        onClick={() => hasAcceptedTerms ? setShowPayLandlord(true) : setShowAgreementModal(true)}
        className="wa-fab"
        aria-label="Pay Rent"
      >
        <Home className="h-6 w-6 pointer-events-none" />
      </button>
      
      <PayLandlordDialog open={showPayLandlord} onOpenChange={setShowPayLandlord} />
      
      {/* Wallet Dialog */}
      <Dialog open={showWallet} onOpenChange={setShowWallet}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>My Wallet</DialogTitle>
          </DialogHeader>
          <WalletCard />
          {/* Repayment Section - Visible after wallet */}
          <div className="mt-4">
            <RepaymentSection 
              userId={user.id}
              activeRequest={rentRequests.find(r => r.status === 'disbursed')}
              repayments={repayments}
              onRepaymentSuccess={fetchData}
            />
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Payment Partners Dialog */}
      <PaymentPartnersDialog 
        open={showPaymentPartners} 
        onOpenChange={setShowPaymentPartners}
        dashboardType="tenant"
        title="Pay Rent via Mobile Money"
      />

      {/* Tenant Agreement Modal */}
      <TenantAgreementModal
        isOpen={showAgreementModal}
        onClose={() => setShowAgreementModal(false)}
        onAccept={handleAcceptAgreement}
        isAccepting={isAcceptingAgreement}
      />
      
      <FloatingShareButton />
      <MobileQuickMenu currentRole={currentRole} />
      <MobileBottomNav currentRole={currentRole} onSignOut={signOut} />
    </PullToRefresh>
  );
}
