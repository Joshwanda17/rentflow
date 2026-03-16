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
  Search,
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
import { WalletDisclaimer } from '@/components/wallet/WalletDisclaimer';
import { useWallet } from '@/hooks/useWallet';
import { hapticTap } from '@/lib/haptics';
import AiIdButton from '@/components/ai-id/AiIdButton';
import { CreditAccessCard } from '@/components/CreditAccessCard';
import { InviteAndEarnCard } from '@/components/shared/InviteAndEarnCard';
import { SubscriptionStatusCard } from '@/components/tenant/SubscriptionStatusCard';

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
import { AvailableHousesSheet } from '@/components/tenant/AvailableHousesSheet';
import { NearbyHousesPreview } from '@/components/tenant/NearbyHousesPreview';

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
  const [housesOpen, setHousesOpen] = useState(false);

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
        <main className="px-4 py-5 space-y-5 animate-fade-in max-w-lg mx-auto">
          {/* Offline Notice */}
          <AnimatePresence>
            {!isOnline && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-warning/10 border border-warning/20">
                  <WifiOff className="h-3.5 w-3.5 text-warning shrink-0" />
                  <p className="text-xs text-warning flex-1">You're offline — data may be outdated</p>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.location.reload()}>
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Terms Acceptance Notice */}
          <TenantAgreementNotice onAcceptClick={() => setShowAgreementModal(true)} />

          {/* Profile + Wallet Hero Card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border/60 bg-card overflow-hidden"
          >
            {/* Profile row */}
            <div className="flex items-center gap-3 p-4 pb-3">
              <button onClick={() => navigate('/settings')} className="shrink-0">
                <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="md" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="font-semibold text-base truncate">{profile?.full_name || 'Welcome'}</h1>
                  {profile?.verified ? (
                    <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 shrink-0" />
                  ) : (
                    <BadgeCheck className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Welile Tenant</p>
              </div>
              <AiIdButton variant="compact" />
            </div>

            {/* Wallet strip */}
            <button
              onClick={handleViewWallet}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 border-t border-border/40 hover:bg-muted/50 transition-colors touch-manipulation"
            >
              <Wallet className="h-5 w-5 text-success shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <p className="font-bold text-lg text-foreground truncate">{formatUGX(wallet?.balance ?? 0)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {profile?.phone && (
                  <>
                    {/^(\+?256)?0?(77|78|76)/.test(profile.phone) && (
                      <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(48,100%,50%)] text-[6px] font-black text-[hsl(220,20%,20%)] leading-none">M</span>
                    )}
                    {/^(\+?256)?0?(75|70|74)/.test(profile.phone) && (
                      <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(0,85%,50%)] text-[6px] font-black text-white leading-none">A</span>
                    )}
                  </>
                )}
                <span className="text-xs text-muted-foreground">→</span>
              </div>
            </button>
            <MerchantCodePills onDeposit={() => setDepositOpen(true)} />
          </motion.div>

          {/* Subscription Status */}
          <SubscriptionStatusCard userId={user.id} />

          {/* Credit Access Limit */}
          <CreditAccessCard userId={user.id} />

          {/* Action Buttons — Clean & Minimal */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Actions</p>
            
            {/* Request Rent */}
            <LockedActionTooltip isLocked={!hasAcceptedTerms && !agreementLoading}>
              <RentRequestButton userId={user.id} onSuccess={fetchData} />
            </LockedActionTooltip>

            {/* Find a House */}
            <button
              onClick={() => { hapticTap(); setHousesOpen(true); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors touch-manipulation"
            >
              <Search className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <p className="font-medium text-sm">Find a House — Daily Rent</p>
                <p className="text-xs text-muted-foreground">Browse affordable homes nearby</p>
              </div>
              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-success/15 text-success rounded-full shrink-0">NEW</span>
            </button>

            {/* Menu */}
            <button
              onClick={handleOpenMenu}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-colors touch-manipulation"
            >
              <Menu className="h-5 w-5 text-foreground/70 shrink-0" />
              <div className="flex-1 text-left">
                <p className="font-medium text-sm">Menu</p>
                <p className="text-xs text-muted-foreground">Payments, tools & more</p>
              </div>
              <span className="text-xs text-muted-foreground">→</span>
            </button>
          </div>

          {/* Nearby Houses — auto-detected */}
          <NearbyHousesPreview onViewAll={() => setHousesOpen(true)} />

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

          {/* Invite & Earn */}
          <InviteAndEarnCard variant="tenant" />

          <WalletDisclaimer />
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
        onBrowseHouses={() => { setMenuOpen(false); setHousesOpen(true); }}
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
      <AvailableHousesSheet open={housesOpen} onOpenChange={setHousesOpen} />

      {/* Fixed footer navigation */}
      <MobileBottomNav currentRole={currentRole} />
    </div>
  );
}
