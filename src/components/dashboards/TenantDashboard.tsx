import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useOffline } from '@/contexts/OfflineContext';
import { 
  Wallet,
  FileText,
  Menu,
  WifiOff,
  RefreshCw,
  BadgeCheck,
  ArrowDownCircle,
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { TenantDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { PullToRefresh } from '@/components/PullToRefresh';
import { PayLandlordDialog } from '@/components/wallet/PayLandlordDialog';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { useWallet } from '@/hooks/useWallet';
import { hapticTap } from '@/lib/haptics';
import AiIdButton from '@/components/ai-id/AiIdButton';
import { CreditAccessCard } from '@/components/CreditAccessCard';

import { RentRequestButton } from '@/components/tenant/RentRequestButton';
import RentRequestForm from '@/components/tenant/RentRequestForm';
import RentCalculator from '@/components/tenant/RentCalculator';
import { 
  TenantAgreementNotice, 
  TenantAgreementModal,
  LockedActionTooltip 
} from '@/components/tenant/agreement';
import { useTenantAgreement } from '@/hooks/useTenantAgreement';
import RepaymentSection from '@/components/tenant/RepaymentSection';
import RentProcessTracker from '@/components/rent/RentProcessTracker';
import PaymentPartnersDialog from '@/components/payments/PaymentPartnersDialog';
import { TenantMenuDrawer } from '@/components/tenant/TenantMenuDrawer';
import { MerchantCodePills } from '@/components/supporter/MerchantCodePills';
import { AgentDepositDialog } from '@/components/agent/AgentDepositDialog';

import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
  const { wallet, refreshWallet } = useWallet();
  const { toast } = useToast();
  const { isAccepted: hasAcceptedTerms, isLoading: agreementLoading, acceptAgreement } = useTenantAgreement();

  const [rentRequests, setRentRequests] = useState<RentRequest[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasCachedData, setHasCachedData] = useState(false);

  // Dialog states
  const [showWallet, setShowWallet] = useState(false);
  const [showPayLandlord, setShowPayLandlord] = useState(false);
  const [showPaymentPartners, setShowPaymentPartners] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [isAcceptingAgreement, setIsAcceptingAgreement] = useState(false);
  const [showRepaymentSchedule, setShowRepaymentSchedule] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

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
      
      // repayments table removed - use empty array
      const newRentRequests = requests || [];
      const newRepayments: Repayment[] = [];
      
      setRentRequests(newRentRequests);
      setRepayments(newRepayments);
      
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

  if (loading && isOnline && !hasCachedData) {
    return <TenantDashboardSkeleton />;
  }

  const handleRefresh = async () => {
    await Promise.all([fetchData(), refreshWallet()]);
  };

  const handleViewWallet = () => { hapticTap(); setShowWallet(true); };
  const handleOpenMenu = () => { hapticTap(); setMenuOpen(true); };

  const menuItems = [
    { icon: FileText, label: 'Request Rent', onClick: () => {} },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      {/* Scrollable content area */}
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 overflow-y-auto pb-28 md:pb-4">
        <main className="px-4 py-6 space-y-8 animate-fade-in max-w-lg mx-auto">
          {/* Offline Notice */}
          <AnimatePresence>
            {!isOnline && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <Card className="border-warning/50 bg-warning/10">
                  <CardContent className="p-3 flex items-center gap-3">
                    <WifiOff className="h-4 w-4 text-warning shrink-0" />
                    <p className="text-sm flex-1">Offline mode</p>
                    <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Terms Acceptance Notice */}
          <TenantAgreementNotice onAcceptClick={() => setShowAgreementModal(true)} />


          {/* Profile Section - Minimal */}
          <div className="text-center space-y-3">
            <button onClick={() => navigate('/settings')} className="mx-auto block">
              <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
            </button>
            <div>
              <h1 className="font-bold text-2xl flex items-center justify-center gap-1.5">
                {profile?.full_name || 'Welcome'}
                {profile?.verified ? (
                  <span className="flex items-center gap-0.5">
                    <BadgeCheck className="h-5 w-5 text-purple-500 fill-purple-500/20" />
                    <span className="text-[10px] text-purple-500 font-medium">Verified</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5">
                    <BadgeCheck className="h-5 w-5 text-muted-foreground/40" />
                    <span className="text-[10px] text-muted-foreground font-medium">Unverified</span>
                  </span>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">Welile Tenant</p>
              <button
                onClick={() => setDepositOpen(true)}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-success/10 border border-success/30 active:scale-95 transition-transform touch-manipulation hover:bg-success/20 mt-2"
              >
                <ArrowDownCircle className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="text-[11px] font-bold text-success">Deposit Funds</span>
              </button>
            </div>
            <AiIdButton variant="compact" />
          </div>

          {/* Credit Access Limit */}
          <CreditAccessCard userId={user.id} />

          {/* ═══════════════════════════════════════════════════════════════════
              THREE MAIN ACTION BUTTONS
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-3">
            {/* 1. WALLET BUTTON - Primary */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleViewWallet}
              className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-success/10 to-emerald-500/10 border-2 border-success/30 hover:border-success/50 transition-all touch-manipulation"
            >
              <div className="p-3 rounded-xl bg-success/20">
                <Wallet className="h-7 w-7 text-success" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-xl text-success">{formatUGX(wallet?.balance ?? 0)}</p>
                <p className="text-sm text-muted-foreground">Wallet Balance</p>
              </div>
            </motion.button>

            {/* 2. REQUEST RENT BUTTON */}
            <LockedActionTooltip isLocked={!hasAcceptedTerms && !agreementLoading}>
              <RentRequestButton userId={user.id} onSuccess={fetchData} />
            </LockedActionTooltip>

            {/* 3. MENU BUTTON */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleOpenMenu}
              className="w-full flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-muted/50 to-muted/30 border-2 border-border hover:border-primary/30 transition-all touch-manipulation"
            >
              <div className="p-3 rounded-xl bg-muted">
                <Menu className="h-7 w-7 text-foreground" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-lg">Menu</p>
                <p className="text-sm text-muted-foreground">Payments, tools & more</p>
              </div>
            </motion.button>
          </div>

          {/* Rent Process Tracker - Show for active requests */}
          {rentRequests.length > 0 && (
            <RentProcessTracker
              requestStatus={rentRequests[0].status}
              agentVerified={true}
              managerApproved={['approved', 'funded', 'disbursed', 'completed'].includes(rentRequests[0].status)}
              supporterFunded={['funded', 'disbursed', 'completed'].includes(rentRequests[0].status)}
              fundRecipientType={(rentRequests[0] as any).fund_recipient_type}
              fundRecipientName={(rentRequests[0] as any).fund_recipient_name}
              fundRoutedAt={(rentRequests[0] as any).fund_routed_at}
            />
          )}

          {/* ADD ROLE COMPONENT */}
          <div className="flex justify-center">
            {addRoleComponent}
          </div>

          {/* Rent Calculator - Only when triggered from menu */}
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

          {/* Request Form - Only when triggered */}
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
                onCancel={() => setShowRequestForm(false)}
              />
            </div>
          )}

          {/* Repayment Schedule - Only when toggled from menu */}
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
        </main>
      </PullToRefresh>

      {/* Full-screen wallet sheet */}
      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />

      {/* Menu Drawer */}
      <TenantMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onPayLandlord={() => hasAcceptedTerms ? setShowPayLandlord(true) : setShowAgreementModal(true)}
        onPayWelile={() => hasAcceptedTerms ? setShowPaymentPartners(true) : setShowAgreementModal(true)}
        onRepaymentSchedule={() => setShowRepaymentSchedule(prev => !prev)}
        onRentCalculator={() => setShowCalculator(true)}
      />

      {/* Dialogs */}
      <PayLandlordDialog open={showPayLandlord} onOpenChange={setShowPayLandlord} />
      <PaymentPartnersDialog 
        open={showPaymentPartners} 
        onOpenChange={setShowPaymentPartners}
        dashboardType="tenant"
        title="Pay Rent via Mobile Money"
      />
      <TenantAgreementModal
        isOpen={showAgreementModal}
        onClose={() => setShowAgreementModal(false)}
        onAccept={handleAcceptAgreement}
        isAccepting={isAcceptingAgreement}
      />
      <AgentDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />

      {/* Fixed footer navigation */}
      <MobileBottomNav currentRole={currentRole} />
    </div>
  );
}
