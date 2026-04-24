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
} from 'lucide-react';
import { FindAHouseCTA } from '@/components/tenant/FindAHouseCTA';
import { formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';

import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { TenantDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { WalletHeroSkeleton, ListSectionSkeleton } from '@/components/skeletons/SectionSkeletons';
import { PayLandlordDialog } from '@/components/wallet/PayLandlordDialog';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import { WalletDisclaimer } from '@/components/wallet/WalletDisclaimer';
import { useWallet } from '@/hooks/useWallet';
import { hapticTap } from '@/lib/haptics';
import AiIdButton from '@/components/ai-id/AiIdButton';
import { UnifiedWalletHeroCard } from '@/components/wallet/UnifiedWalletHeroCard';
import { CreditAccessCard } from '@/components/CreditAccessCard';
import { InviteAndEarnCard } from '@/components/shared/InviteAndEarnCard';
import { SubscriptionStatusCard } from '@/components/tenant/SubscriptionStatusCard';
import { VerificationChecklist } from '@/components/shared/VerificationChecklist';

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
import { TenantBusinessAdvancesPanel } from '@/components/tenant/TenantBusinessAdvancesPanel';
import PaymentPartnersDialog from '@/components/payments/PaymentPartnersDialog';
import { TenantMenuDrawer } from '@/components/tenant/TenantMenuDrawer';
import { MerchantCodePills } from '@/components/supporter/MerchantCodePills';
import { AgentDepositDialog } from '@/components/agent/AgentDepositDialog';
import { AvailableHousesSheet } from '@/components/tenant/AvailableHousesSheet';
import { NearbyHousesPreview } from '@/components/tenant/NearbyHousesPreview';
import { SuggestedHousesCard } from '@/components/tenant/SuggestedHousesCard';
import RentHistoryRecordCTA from '@/components/tenant/RentHistoryRecordCTA';
import { TrustBoostBanner } from '@/components/ai-id/TrustBoostBanner';

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

  // Local-first: read cache synchronously for instant paint
  const [rentRequests, setRentRequests] = useState<RentRequest[]>(() => {
    try {
      const raw = localStorage.getItem(`tenant_dashboard_${user.id}`);
      if (raw) return JSON.parse(raw).rentRequests || [];
    } catch {}
    return [];
  });
  const [repayments, setRepayments] = useState<Repayment[]>(() => {
    try {
      const raw = localStorage.getItem(`tenant_dashboard_${user.id}`);
      if (raw) return JSON.parse(raw).repayments || [];
    } catch {}
    return [];
  });
  const hasCachedData = rentRequests.length > 0;
  const [loading, setLoading] = useState(!hasCachedData);

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

  // Background fetch — never blocks UI if cache exists
  useEffect(() => {
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }
    
    (async () => {
      try {
        const { data: requests } = await supabase
          .from('rent_requests')
          .select('*')
          .eq('tenant_id', user.id)
          .order('created_at', { ascending: false });
        
        const newRentRequests = requests || [];
        const newRepayments: Repayment[] = [];
        
        setRentRequests(newRentRequests);
        setRepayments(newRepayments);
        
        localStorage.setItem(`tenant_dashboard_${user.id}`, JSON.stringify({
          rentRequests: newRentRequests,
          repayments: newRepayments,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('[TenantDashboard] Error fetching data:', error);
      }
      setLoading(false);
    })();
  }, [user.id]);

  const fetchData = async () => {
    if (!navigator.onLine) return;
    try {
      const { data: requests } = await supabase
        .from('rent_requests')
        .select('*')
        .eq('tenant_id', user.id)
        .order('created_at', { ascending: false });
      
      const newRentRequests = requests || [];
      setRentRequests(newRentRequests);
      setRepayments([]);
      
      localStorage.setItem(`tenant_dashboard_${user.id}`, JSON.stringify({
        rentRequests: newRentRequests,
        repayments: [],
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('[TenantDashboard] Error fetching data:', error);
    }
  };

  // Progressive rendering: header + skeleton placeholders render immediately;
  // individual widgets reveal as their data arrives. The legacy full-page
  // skeleton is kept for the rare empty-cache *offline* case only.
  const showFullSkeleton = loading && !hasCachedData && !isOnline;
  if (showFullSkeleton) {
    return <TenantDashboardSkeleton />;
  }
  const dataLoading = loading && !hasCachedData;

  const handleRefresh = async () => {
    await Promise.all([fetchData(), refreshWallet()]);
  };

  const handleViewWallet = () => { hapticTap(); setShowWallet(true); };
  const handleOpenMenu = () => { hapticTap(); setMenuOpen(true); };

  const menuItems = [
    { icon: FileText, label: 'Request Rent', onClick: () => {} },
  ];

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto pb-16 md:pb-4">
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

          {/* Welile Trust Score nudge */}
          <TrustBoostBanner />

          {/* Profile Row */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <button onClick={() => navigate('/settings')} className="shrink-0">
              <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="md" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium">Welcome back</p>
              <h1 className="font-bold text-lg leading-tight flex items-center gap-1.5 flex-wrap">
                <span className="break-words">{profile?.full_name || 'Welcome'}</span>
                {profile?.verified ? (
                  <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 shrink-0" />
                ) : (
                  <BadgeCheck className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                )}
              </h1>
            </div>
            <AiIdButton variant="compact" />
          </motion.div>

          {/* Wallet Hero Card */}
          {wallet ? (
            <UnifiedWalletHeroCard
              balance={wallet?.balance ?? 0}
              role="tenant"
              secondaryLabel="Used for Rent"
              secondaryValue={formatUGX(rentRequests.find(r => ['approved', 'funded', 'disbursed', 'repaying'].includes(r.status))?.rent_amount ?? 0)}
            />
          ) : (
            <WalletHeroSkeleton />
          )}
          

          {/* Verification Checklist */}
          <VerificationChecklist userId={user.id} highlightRole="tenant" compact />

          {/* Subscription Status */}
          <SubscriptionStatusCard userId={user.id} />

          {/* Credit Access Limit */}
          <CreditAccessCard userId={user.id} compact />

          {/* Record Rent History — prominent attention-grabbing CTA */}
          <RentHistoryRecordCTA />

          {/* Action Buttons — Clean & Minimal */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-0.5">Actions</p>
            
            {/* Request Rent */}
            <LockedActionTooltip isLocked={!hasAcceptedTerms && !agreementLoading}>
              <RentRequestButton userId={user.id} onSuccess={fetchData} />
            </LockedActionTooltip>

            {/* Find a House — Hero CTA */}
            <FindAHouseCTA onClick={() => { hapticTap(); setHousesOpen(true); }} />

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

          {/* Suggested Houses — matched to tenant */}
          <SuggestedHousesCard userId={user.id} onViewAll={() => setHousesOpen(true)} />

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

          {/* Repayment Summary — always visible for active/completed requests */}
          {rentRequests.some(r => ['disbursed', 'completed', 'funded', 'repaying'].includes(r.status)) && (
            <RepaymentSection
              userId={user.id}
              activeRequest={rentRequests.find(r => ['disbursed', 'repaying'].includes(r.status))}
              repayments={repayments}
              onRepaymentSuccess={fetchData}
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

          {/* Business Advances (1% daily compounding) */}
          <TenantBusinessAdvancesPanel />

          {/* Invite & Earn */}
          <InviteAndEarnCard variant="tenant" />

          <WalletDisclaimer />
        </main>
      </div>

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
      
    </div>
  );
}
