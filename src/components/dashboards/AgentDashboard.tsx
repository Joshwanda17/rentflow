import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { User } from '@supabase/supabase-js';

import AiIdButton from '@/components/ai-id/AiIdButton';
import { UnifiedWalletHeroCard } from '@/components/wallet/UnifiedWalletHeroCard';
import { AgentRiskExposureCard } from '@/components/agent/AgentRiskExposureCard';
import { AgentCompanyDebtCard } from '@/components/agent/AgentCompanyDebtCard';
import { EarnedSinceLastWithdrawalCard } from '@/components/agent/EarnedSinceLastWithdrawalCard';

import { Button } from '@/components/ui/button';
import { 
  UserPlus,
  Menu,
  WifiOff,
  RefreshCw,
  BadgeCheck,
  Home,
  TrendingUp,
  Banknote,
  FileText,
  Users,
  Sparkles,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Building2,
  Briefcase,
  UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppRole } from '@/hooks/useAuth';
import { ReactNode } from 'react';
import DashboardHeader from '@/components/DashboardHeader';
import { FullScreenWalletSheet } from '@/components/wallet/FullScreenWalletSheet';
import DepositFlow from '@/components/payments/DepositFlow';
import WithdrawFlow from '@/components/payments/WithdrawFlow';
import { SendMoneyDialog } from '@/components/wallet/SendMoneyDialog';

import { useProfile } from '@/hooks/useProfile';
import { UserAvatar } from '@/components/UserAvatar';
import { AgentDepositDialog } from '@/components/agent/AgentDepositDialog';
import { UnifiedRegistrationDialog } from '@/components/agent/UnifiedRegistrationDialog';
import { RegisterSubAgentDialog } from '@/components/agent/RegisterSubAgentDialog';
import { SubAgentsPanel } from '@/components/agent/SubAgentsPanel';
import AgentRentRequestDialog from '@/components/agent/AgentRentRequestDialog';
import BusinessAdvanceRequestDialog from '@/components/agent/BusinessAdvanceRequestDialog';
import { CommissionCelebrationModal } from '@/components/agent/CommissionCelebrationModal';
import { useBusinessAdvanceCommissionListener } from '@/hooks/useBusinessAdvanceCommissionListener';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { AgentDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { WalletHeroSkeleton } from '@/components/skeletons/SectionSkeletons';

import { hapticTap } from '@/lib/haptics';
import { AgentAgreementBanner } from '@/components/agent/agreement';
import { VerificationChecklist } from '@/components/shared/VerificationChecklist';
import { useOffline } from '@/contexts/OfflineContext';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PendingDraftsBanner } from '@/components/agent/PendingDraftsBanner';
import { useOfflineAgentDashboard } from '@/hooks/useOfflineAgentDashboard';
import { useWallet } from '@/hooks/useWallet';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { useAgentLandlordFloat } from '@/hooks/useAgentLandlordFloat';
import { EarningsRankSystemSheet } from '@/components/agent/EarningsRankSystemSheet';
import { AgentMenuDrawer } from '@/components/agent/AgentMenuDrawer';
import { AgentHubTabs, type AgentHubTab } from '@/components/agent/AgentHubTabs';
import { AgentActionInsights } from '@/components/agent/AgentActionInsights';
import { AgentManagedPropertyDialog } from '@/components/agent/AgentManagedPropertyDialog';
import { AgentManagedPropertiesSheet } from '@/components/agent/AgentManagedPropertiesSheet';
import { AgentLandlordPayoutDialog } from '@/components/agent/AgentLandlordPayoutDialog';
import { AgentLandlordPayoutFlow } from '@/components/agent/AgentLandlordPayoutFlow';
import { AgentLandlordFloatCard } from '@/components/agent/AgentLandlordFloatCard';
import { AgentTenantHealthCard } from '@/components/agent/AgentTenantHealthCard';
import { AgentVouchHighlightCard } from '@/components/agent/AgentVouchHighlightCard';
import { AgentFloatPayoutWizard } from '@/components/agent/AgentFloatPayoutWizard';
import { AgentLandlordFloatAllocationsDialog } from '@/components/agent/AgentLandlordFloatAllocationsDialog';
import { LandlordRecoveryLedger } from '@/components/agent/LandlordRecoveryLedger';
import { FloatPayoutStatusTracker } from '@/components/agent/FloatPayoutStatusTracker';
import { FloatTransactionHistory } from '@/components/agent/FloatTransactionHistory';
import { VerificationOpportunitiesButton } from '@/components/agent/VerificationOpportunitiesButton';
import { AgentNotificationBell } from '@/components/agent/AgentNotificationBell';
import { CreditVerificationButton } from '@/components/agent/CreditVerificationButton';
import { AgentMyRentRequestsSheet } from '@/components/agent/AgentMyRentRequestsSheet';
import { AgentTenantsSheet } from '@/components/agent/AgentTenantsSheet';
import { AgentManagedUsersSheet } from '@/components/agent/AgentManagedUsersSheet';
import { FieldCollectDialog } from '@/components/agent/FieldCollectDialog';
import { FieldCollectFab } from '@/components/agent/FieldCollectFab';
import { FieldCollectReconciliationSheet } from '@/components/agent/FieldCollectReconciliationSheet';
import { getDuplicateEntries } from '@/lib/fieldCollectStore';
import { FileWarning } from 'lucide-react';
import { FieldCollectDailyTotals } from '@/components/agent/FieldCollectDailyTotals';
import { FieldCollectCard } from '@/components/agent/FieldCollectCard';
import { FieldDepositQueueCard } from '@/components/agent/FieldDepositQueueCard';
import { CollectFromReferenceDialog } from '@/components/agent/CollectFromReferenceDialog';

import { AgentTopUpTenantDialog } from '@/components/agent/AgentTopUpTenantDialog';
import { AgentInvestForPartnerDialog } from '@/components/agent/AgentInvestForPartnerDialog';
import { AgentAngelPoolInvestDialog } from '@/components/agent/AgentAngelPoolInvestDialog';
import { ProxyInvestmentHistorySheet } from '@/components/agent/ProxyInvestmentHistorySheet';
import { AgentReceiptDialog } from '@/components/agent/AgentReceiptDialog';
import { AgentLandlordMapSheet } from '@/components/agent/AgentLandlordMapSheet';
import { RentalFinderSheet } from '@/components/agent/RentalFinderSheet';
import { ListEmptyHouseDialog } from '@/components/agent/ListEmptyHouseDialog';
import { AgentListingsSheet } from '@/components/agent/AgentListingsSheet';
import { NearbyTenantsSheet } from '@/components/agent/NearbyTenantsSheet';
import { MySubAgentsSheet } from '@/components/agent/MySubAgentsSheet';
import { RecruitSubAgentCTA } from '@/components/agent/RecruitSubAgentCTA';
import { QuickShareSubAgentSheet } from '@/components/agent/QuickShareSubAgentSheet';
import { ShareLandlordLinkDialog } from '@/components/agent/ShareLandlordLinkDialog';
import { FunderManagementSheet } from '@/components/agent/FunderManagementSheet';
import { AgentPartnerDashboardSheet } from '@/components/agent/AgentPartnerDashboardSheet';
import { Card, CardContent } from '@/components/ui/card';
import { CreditAccessCard } from '@/components/CreditAccessCard';
import { ApprovedRentRequestsWidget } from '@/components/rent/ApprovedRentRequestsWidget';
import { RecentAutoCharges } from '@/components/wallet/RecentAutoCharges';
import { AgentTenantRentRequestsList } from '@/components/agent/AgentTenantRentRequestsList';
import { AgentVerificationOpportunitiesCard } from '@/components/agent/AgentVerificationOpportunitiesCard';
import { ShareRentRecorderCard } from '@/components/agent/ShareRentRecorderCard';
import { TodayCollectionsCard } from '@/components/agent/TodayCollectionsCard';
import { AgentPriorityGrid } from '@/components/agent/AgentPriorityGrid';
import { useIsFinancialAgent } from '@/hooks/useIsFinancialAgent';
import { FinancialAgentSection } from '@/components/agent/FinancialAgentSection';
import { PromissoryNoteDialog } from '@/components/agent/PromissoryNoteDialog';
import { AgentPromissoryNotesList } from '@/components/agent/AgentPromissoryNotesList';
import { AgentAdvanceRequestForm } from '@/components/agent/AgentAdvanceRequestForm';
import LendingAgentPortal from '@/components/vouch/agent/LendingAgentPortal';

// New Phase 1 components
import { AgentDailyOpsCard } from '@/components/agent/AgentDailyOpsCard';
import { AgentVisitPaymentWizard } from '@/components/agent/AgentVisitPaymentWizard';
import { GeneratePaymentTokenDialog } from '@/components/agent/GeneratePaymentTokenDialog';
import { RecordAgentCollectionDialog } from '@/components/agent/RecordAgentCollectionDialog';
import { AgentDepositCashDialog } from '@/components/agent/AgentDepositCashDialog';
import { AgentCashPayoutsTab } from '@/components/agent/AgentCashPayoutsTab';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AgentDashboardProps {
  user: User;
  signOut: () => Promise<void>;
  currentRole: AppRole;
  availableRoles: AppRole[];
  onRoleChange: (role: AppRole) => void;
  addRoleComponent: ReactNode;
}

export default function AgentDashboard({ user, signOut, currentRole, availableRoles, onRoleChange, addRoleComponent }: AgentDashboardProps) {
  // ── DEV/QA: deliberate crash switch to verify DashboardErrorBoundary fallback.
  // Trigger by visiting /dashboard/agent?crash=1 (render-time throw)
  // or ?crash=effect (post-mount throw inside a useEffect).
  // Safe to leave in: only fires when the query param is explicitly set.
  const [qaCrashAfterMount, setQaCrashAfterMount] = useState(false);
  if (qaCrashAfterMount) {
    throw new Error('[AgentDashboard] Deliberate post-mount crash for ErrorBoundary QA (mode=effect)');
  }
  if (typeof window !== 'undefined') {
    const crashMode = new URLSearchParams(window.location.search).get('crash');
    if (crashMode && crashMode !== 'effect') {
      throw new Error(`[AgentDashboard] Deliberate crash for ErrorBoundary QA (mode=${crashMode})`);
    }
  }
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { refreshEarnings, totalEarnings } = useAgentEarnings();
  const { wallet, refreshWallet } = useWallet();
  const { commissionBalance, withdrawableBalance, otherBalance, refetch: refreshBalances } = useAgentBalances();
  const { floatBalance: walletFloatBalance } = useAgentBalances();
  // Kept for the lower AgentLandlordFloatCard / sheets (CFO escrow, NOT the wallet float)
  const { floatBalance: landlordPayoutFloat } = useAgentLandlordFloat();
  const { isOnline } = useOffline();
  
  const { 
    stats, 
    isLoading: loading, 
    refreshData: refreshOfflineData, 
    hasLoadedOnce 
  } = useOfflineAgentDashboard();
  
  const { tenantsCount, referralCount, subAgentCount } = stats;
  
  const [depositOpen, setDepositOpen] = useState(false);
  const [registerUserOpen, setRegisterUserOpen] = useState(false);
  const [inviteSubAgentOpen, setInviteSubAgentOpen] = useState(false);
  const [rentRequestOpen, setRentRequestOpen] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [earningsRankOpen, setEarningsRankOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [managedPropertyOpen, setManagedPropertyOpen] = useState(false);
  const [managedPropertiesSheetOpen, setManagedPropertiesSheetOpen] = useState(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutProperty, setPayoutProperty] = useState<any>(null);
  const [myRentRequestsOpen, setMyRentRequestsOpen] = useState(false);
  
  const [topUpTenantOpen, setTopUpTenantOpen] = useState(false);
  const [businessAdvanceOpen, setBusinessAdvanceOpen] = useState(false);
  const { event: commissionEvent, dismiss: dismissCommission } = useBusinessAdvanceCommissionListener();
  const [tenantsSheetOpen, setTenantsSheetOpen] = useState(false);
  const [fieldCollectOpen, setFieldCollectOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);

  // Poll local IndexedDB for duplicate entries needing reconciliation
  useEffect(() => {
    // ── DEV/QA: post-mount crash to verify ErrorBoundary catches effect errors.
    if (typeof window !== 'undefined') {
      const crashMode = new URLSearchParams(window.location.search).get('crash');
      if (crashMode === 'effect') {
        // Flip flag so the next render throws — Error Boundaries only catch
        // errors thrown during render/lifecycle, not async setTimeout throws.
        setTimeout(() => setQaCrashAfterMount(true), 50);
      }
    }
    if (!user?.id) return;
    let alive = true;
    const tick = async () => {
      try {
        const dups = await getDuplicateEntries(user.id);
        if (alive) setDuplicateCount(dups.length);
      } catch { /* ignore */ }
    };
    tick();
    const iv = window.setInterval(tick, 5000);
    return () => { alive = false; window.clearInterval(iv); };
  }, [user?.id, fieldCollectOpen, reconcileOpen]);
  const [investForPartnerOpen, setInvestForPartnerOpen] = useState(false);
  const [proxyHistoryOpen, setProxyHistoryOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [landlordMapOpen, setLandlordMapOpen] = useState(false);
  const [rentalFinderOpen, setRentalFinderOpen] = useState(false);
  const [listHouseOpen, setListHouseOpen] = useState(false);
  const [myListingsOpen, setMyListingsOpen] = useState(false);

  // Phase 1: Agent Operations dialogs
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [recordCollectionOpen, setRecordCollectionOpen] = useState(false);
  const [depositCashOpen, setDepositCashOpen] = useState(false);
  const [nearbyTenantsOpen, setNearbyTenantsOpen] = useState(false);
  const [applyingToSell, setApplyingToSell] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [subAgentsSheetOpen, setSubAgentsSheetOpen] = useState(false);
  const [managedUsersOpen, setManagedUsersOpen] = useState(false);
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const [funderSheetOpen, setFunderSheetOpen] = useState(false);
  const [partnerDashboardOpen, setPartnerDashboardOpen] = useState(false);
  const [cashPayoutsOpen, setCashPayoutsOpen] = useState(false);
  const [landlordPayoutFlowOpen, setLandlordPayoutFlowOpen] = useState(false);
  const [floatPayoutOpen, setFloatPayoutOpen] = useState(false);
  const [floatAllocationsOpen, setFloatAllocationsOpen] = useState(false);
  const [recoveryLedgerOpen, setRecoveryLedgerOpen] = useState(false);
  const [payoutStatusOpen, setPayoutStatusOpen] = useState(false);
  const [floatHistoryOpen, setFloatHistoryOpen] = useState(false);
  const [requisitionOpen, setRequisitionOpen] = useState(false);
  const [angelPoolInvestOpen, setAngelPoolInvestOpen] = useState(false);
  const [promissoryNoteOpen, setPromissoryNoteOpen] = useState(false);
  const [promissoryListOpen, setPromissoryListOpen] = useState(false);
  const [advanceRequestOpen, setAdvanceRequestOpen] = useState(false);
  const [shareLandlordOpen, setShareLandlordOpen] = useState(false);
  const [lendingAgentOpen, setLendingAgentOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentHubTab>('home');

  const [showQuickDeposit, setShowQuickDeposit] = useState(false);
  const [showQuickWithdraw, setShowQuickWithdraw] = useState(false);
  const [showQuickTransfer, setShowQuickTransfer] = useState(false);
  const [collectFromRefOpen, setCollectFromRefOpen] = useState(false);

  const { isFinancialAgent } = useIsFinancialAgent();
  const realWithdrawableBalance = Math.max(0, withdrawableBalance);
  // Check if this agent is a CFO-assigned cashout agent
  const { data: isCashoutAgent } = useQuery({
    queryKey: ['is-cashout-agent', user.id],
    queryFn: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data } = await supabase
        .from('cashout_agents')
        .select('*')
        .eq('agent_id', user.id)
        .eq('is_active', true)
        .maybeSingle();
      return data;
    },
  });

  const handleShareLandlordSignup = () => {
    hapticTap();
    setShareLandlordOpen(true);
  };

  const handleApplyToSell = async () => {
    setApplyingToSell(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase
        .from('profiles')
        .update({ seller_application_status: 'pending' })
        .eq('id', user.id);
      if (error) throw error;
      const { toast } = await import('sonner');
      toast.success('Application submitted! A manager will review your request.');
    } catch (err) {
      const { toast } = await import('sonner');
      toast.error('Failed to submit application');
    } finally {
      setApplyingToSell(false);
    }
  };

  // Progressive rendering: header + cached/empty widgets paint immediately;
  // skeleton placeholders fill data-bound regions until the snapshot lands.
  // We only fall back to the full-page skeleton if the user is OFFLINE with
  // no cache (nothing else can render anyway).
  const showFullSkeleton = loading && !isOnline && !hasLoadedOnce;
  if (showFullSkeleton) {
    return <AgentDashboardSkeleton />;
  }
  const dataLoading = loading && !hasLoadedOnce;

  const handleRefresh = async () => {
    await Promise.all([refreshOfflineData(), refreshEarnings(), refreshWallet(), refreshBalances()]);
  };

  const handleRegisterUser = () => { hapticTap(); setRegisterUserOpen(true); };
  // Route the side-menu Deposit entry to the same flow used by the hero
  // wallet card so agents have ONE deposit experience, not two. The hero
  // flow defaults to Operational Float (collected rent cash) and still
  // lets the agent switch to Personal Deposit through the existing
  // confirmation gate inside the form.
  const handleDeposit = () => { hapticTap(); setShowQuickDeposit(true); };
  const handleInviteSubAgent = () => { hapticTap(); setInviteSubAgentOpen(true); };
  const handleViewWallet = () => { hapticTap(); setShowWallet(true); };
  const handleOpenMenu = () => { hapticTap(); setMenuOpen(true); };

  const menuItems = [
    { icon: UserPlus, label: 'Register User', onClick: handleRegisterUser },
  ];

  const quickActions = [] as any[];

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <OfflineBanner />
      <PendingDraftsBanner />
      
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <div className="flex-1 overflow-y-auto">
        <main className="px-4 pt-5 pb-16 space-y-5 max-w-lg mx-auto">
        {/* Offline Notice */}
        {!isOnline && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-warning/10 border border-warning/20">
            <WifiOff className="h-3.5 w-3.5 text-warning shrink-0" />
            <p className="text-xs text-warning flex-1">You're offline — data may be outdated</p>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => window.location.reload()}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        )}

        <AgentAgreementBanner />

        {/* Profile + Name + AI ID */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { hapticTap(); navigate('/settings'); }}
            aria-label="Open profile and settings"
            title="Profile & settings"
            className="shrink-0 rounded-full touch-manipulation active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <UserAvatar avatarUrl={profile?.avatar_url} fullName={profile?.full_name} size="lg" />
            <span className="sr-only">{profile?.full_name ? `${profile.full_name} — profile and settings` : 'Profile and settings'}</span>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-xl leading-tight flex items-center gap-1.5 flex-wrap">
              <span className="break-words">{profile?.full_name || 'Agent'}</span>
              {profile?.verified && (
                <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 shrink-0" />
              )}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Welile Agent{profile?.territory ? ` · ${profile.territory}` : ''}</p>
          </div>
          <AiIdButton variant="compact" />
          <AgentNotificationBell userId={user.id} />
        </div>

        {/* Wallet Hero Card — always visible */}
        {wallet ? (
          <UnifiedWalletHeroCard
          balance={walletFloatBalance + realWithdrawableBalance}
          role="agent"
          floatBalance={walletFloatBalance}
          commissionBalance={commissionBalance}
          withdrawableBalance={realWithdrawableBalance}
          otherBalance={otherBalance}
          onOpenWallet={() => setShowWallet(true)}
          quickActions={
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => { hapticTap(); setShowQuickDeposit(true); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/20 hover:bg-white/10 active:scale-95 transition-all min-h-[44px]"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ArrowDownToLine className="h-4 w-4 text-white/80" />
                <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Deposit</span>
              </button>
              <button
                onClick={() => { hapticTap(); setShowQuickWithdraw(true); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/20 hover:bg-white/10 active:scale-95 transition-all min-h-[44px]"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ArrowUpFromLine className="h-4 w-4 text-white/80" />
                <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Withdraw</span>
              </button>
              <button
                onClick={() => { hapticTap(); setShowQuickTransfer(true); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/20 hover:bg-white/10 active:scale-95 transition-all min-h-[44px]"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ArrowLeftRight className="h-4 w-4 text-white/80" />
                <span className="text-[11px] font-bold text-white/80 uppercase tracking-wider">Transfer</span>
              </button>
            </div>
          }
          />
        ) : (
          // Wallet still loading — show the skeleton AND a tappable Deposit
          // strip so the agent never feels like the dashboard is "frozen".
          // Without this, the hero Deposit button doesn't exist for the
          // first ~1–3s after the dashboard mounts and taps appear to do
          // nothing, which is the most common "deposit button is broken"
          // complaint.
          <div className="space-y-3">
            <WalletHeroSkeleton />
            <div className="flex items-center gap-2.5 px-1">
              <button
                onClick={() => { hapticTap(); setShowQuickDeposit(true); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted active:scale-95 transition-all min-h-[44px]"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Deposit</span>
              </button>
              <button
                onClick={() => { hapticTap(); setShowQuickWithdraw(true); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted active:scale-95 transition-all min-h-[44px]"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Withdraw</span>
              </button>
              <button
                onClick={() => { hapticTap(); setShowQuickTransfer(true); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted active:scale-95 transition-all min-h-[44px]"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Transfer</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation — sticky so it stays under the header and never collides with the fixed bottom role switcher */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background border-b border-border/40">
          <AgentHubTabs active={activeTab} onChange={setActiveTab} />
        </div>

        {/* === HOME TAB === Most-used actions, at-a-glance */}
        {activeTab === 'home' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/*
             * Agent shortcut: paste a bank reference / MoMo TID / merchant
             * receipt number you grabbed in the field, and we resolve it
             * to either your in-flight Operational Float deposit or the
             * un-deposited collections it covers — then auto-build the
             * per-tenant breakdown so you don't re-type anything.
             */}
            <button
              type="button"
              onClick={() => { hapticTap(); setCollectFromRefOpen(true); }}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl border border-primary/30 bg-primary/5 hover:bg-primary/10 active:scale-[0.98] transition-all touch-manipulation min-h-[64px] text-left"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="p-2.5 rounded-xl bg-primary/15 text-primary shrink-0">
                <FileText className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-foreground truncate">
                  Collect from receipt / reference
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  Paste a TID or bank ref → auto-build the breakdown
                </div>
              </div>
              <span className="text-base text-primary shrink-0">›</span>
            </button>

            {/*
             * Minimalist home: 4 priority tiles → today's totals → urgent alerts only.
             * Everything else (advances, lending, sub-agents, partners, etc.)
             * lives behind the single "Grow" button, which opens the existing
             * AgentMenuDrawer so no functionality is lost.
             */}
            <AgentPriorityGrid
              agentId={user.id}
              onOpenFieldCollect={() => setFieldCollectOpen(true)}
              onOpenNewTenant={() => setRentRequestOpen(true)}
              onOpenListHouse={() => setListHouseOpen(true)}
            />

            {/* Quick access: agent's own listed houses */}
            <button
              type="button"
              onClick={() => { hapticTap(); setMyListingsOpen(true); }}
              aria-label="View my listed houses"
              title="View my listed houses"
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-accent/40 active:scale-[0.99] transition-all text-left touch-manipulation min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Home className="h-4 w-4 text-muted-foreground" />
                My listed houses
              </span>
              <span className="text-xs font-medium text-primary">View →</span>
            </button>

            {/* Today's collected total — single most useful at-a-glance number */}
            <FieldCollectDailyTotals live />

            {/* Urgent: duplicates that need reconciliation */}
            {duplicateCount > 0 && (
              <button
                type="button"
                onClick={() => setReconcileOpen(true)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-warning/30 bg-warning/10 hover:bg-warning/20 transition-colors text-left touch-manipulation min-h-[56px]"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileWarning className="h-5 w-5 text-warning shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {duplicateCount} receipt{duplicateCount === 1 ? '' : 's'} need a check
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      Tap to review
                    </div>
                  </div>
                </div>
                <span className="text-xs font-medium text-warning shrink-0">Review →</span>
              </button>
            )}

            {/* Urgent: merchant agents only — visible when assigned */}
            {isCashoutAgent && (
              <button
                onClick={() => { hapticTap(); setCashPayoutsOpen(true); }}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-warning/40 bg-warning/10 touch-manipulation active:scale-[0.97] transition-all min-h-[56px]"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <div className="p-2.5 rounded-xl bg-warning/20 shrink-0">
                  <Banknote className="h-5 w-5 text-warning" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">Merchant Payouts</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    MoMo · Bank{isCashoutAgent.handles_cash ? ' · Cash' : ''}
                  </p>
                </div>
                <span className="text-base text-warning shrink-0">›</span>
              </button>
            )}

            {/* Single Grow button → reveals every other tool via the menu drawer */}
            <button
              onClick={handleOpenMenu}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 active:scale-[0.98] transition-all touch-manipulation min-h-[56px]"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <TrendingUp className="h-5 w-5 text-primary" strokeWidth={2.2} />
              <span className="text-sm font-bold text-primary">Grow — more tools</span>
            </button>
          </div>
        )}

        {/* === MONEY TAB === Wallet, advances, payouts, recovery */}
        {activeTab === 'money' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <AgentCompanyDebtCard onViewBreakdown={() => { hapticTap(); setTenantsSheetOpen(true); }} />
            <AgentRiskExposureCard />
            <EarnedSinceLastWithdrawalCard />
            <AgentLandlordFloatCard
              onPayLandlord={() => { hapticTap(); setFloatAllocationsOpen(true); }}
              onOpenRecovery={() => { hapticTap(); setRecoveryLedgerOpen(true); }}
              onOpenHistory={() => { hapticTap(); setFloatHistoryOpen(true); }}
              onOpenStatusTracker={() => { hapticTap(); setPayoutStatusOpen(true); }}
            />
            <button
              onClick={() => { hapticTap(); setBusinessAdvanceOpen(true); }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 ring-1 ring-primary/30 active:scale-[0.98] transition-all touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="p-2.5 rounded-xl bg-primary text-primary-foreground shadow-md">
                <Briefcase className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-sm text-foreground">Business Advance</div>
                <div className="text-[11px] text-muted-foreground">Request advance for tenant's business · Earn 4% on every repayment</div>
              </div>
              <span className="text-xs font-bold text-primary">→</span>
            </button>
            <button
              onClick={() => { hapticTap(); setLendingAgentOpen(true); }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-emerald-500/10 to-primary/5 ring-1 ring-emerald-500/30 active:scale-[0.98] transition-all touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-md">
                <Banknote className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-sm text-foreground">Lending Agent</div>
                <div className="text-[11px] text-muted-foreground">Lend to Welile users from your wallet · Earn interest</div>
              </div>
              <span className="text-xs font-bold text-emerald-700">→</span>
            </button>
            <RecentAutoCharges />
          </div>
        )}

        {/* === TENANTS TAB === People & properties */}
        {activeTab === 'tenants' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: FileText, label: 'New Tenant', onClick: () => setRentRequestOpen(true) },
                { icon: Users, label: 'My Tenants', onClick: () => setTenantsSheetOpen(true) },
              { icon: UserCog, label: 'Managed Users', onClick: () => setManagedUsersOpen(true) },
                // 'Pay Rent' (AgentTopUpTenantDialog → agent-deposit) DEACTIVATED 2026-05-15:
                // produced phantom repayments — record_rent_request_repayment commits before
                // the agent_float_used_for_rent ledger leg is posted, so when the ledger leg
                // fails the rent looks paid with no cash movement. Use Field Collect instead.
                { icon: Home, label: 'List House', onClick: () => setListHouseOpen(true) },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => { hapticTap(); a.onClick(); }}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/60 active:scale-[0.97] transition-all min-h-[64px] text-left touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
                    <a.icon className="h-4.5 w-4.5" strokeWidth={2.2} />
                  </div>
                  <span className="font-semibold text-[13px] text-foreground truncate">{a.label}</span>
                </button>
              ))}
            </div>
            <VerificationChecklist userId={user.id} highlightRole="agent" compact />
            <AgentActionInsights agentId={user.id} hideDailyRent />
          </div>
        )}

        {/* === GROW TAB === Share, recruit, partners */}
        {activeTab === 'grow' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: Building2, label: 'Share Landlord', onClick: handleShareLandlordSignup },
                { icon: Sparkles, label: 'Partners', onClick: () => navigate('/agent/partners') },
                { icon: UserPlus, label: 'Invite & Earn', onClick: () => navigate('/referrals') },
                { icon: Menu, label: 'All Menu', onClick: handleOpenMenu },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => { hapticTap(); a.onClick(); }}
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-border/60 active:scale-[0.97] transition-all min-h-[64px] text-left touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <div className="p-2 rounded-xl bg-accent text-accent-foreground shrink-0">
                    <a.icon className="h-4.5 w-4.5" strokeWidth={2.2} />
                  </div>
                  <span className="font-semibold text-[13px] text-foreground truncate">{a.label}</span>
                </button>
              ))}
            </div>
            <ShareRentRecorderCard />
          </div>
        )}

        {/* === SUB AGENTS TAB === Team management */}
        {activeTab === 'subagents' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <SubAgentsPanel agentId={user.id} onInviteSubAgent={handleInviteSubAgent} />
          </div>
        )}

        </main>
      </div>

      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />
      <DepositFlow
        open={showQuickDeposit}
        onOpenChange={setShowQuickDeposit}
        allowedPurposes={['personal_deposit', 'operational_float']}
        defaultPurpose="personal_deposit"
      />
      <WithdrawFlow open={showQuickWithdraw} onOpenChange={setShowQuickWithdraw} availableBalance={realWithdrawableBalance} />
      <SendMoneyDialog open={showQuickTransfer} onOpenChange={setShowQuickTransfer} />

      <CollectFromReferenceDialog
        open={collectFromRefOpen}
        onOpenChange={setCollectFromRefOpen}
        agentId={user.id}
      />
      
      <AgentMenuDrawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onRegisterUser={handleRegisterUser}
        onDeposit={handleDeposit}
        onPostRentRequest={() => setRentRequestOpen(true)}
        onInviteSubAgent={handleInviteSubAgent}
        onOpenEarningsRank={() => setEarningsRankOpen(true)}
        onManageProperty={() => { setMenuOpen(false); setManagedPropertyOpen(true); }}
        onViewManagedProperties={() => { setMenuOpen(false); setManagedPropertiesSheetOpen(true); }}
        onViewMyRentRequests={() => { setMenuOpen(false); setMyRentRequestsOpen(true); }}
        onTopUpTenant={() => {
          // Disabled — see Pay Rent deactivation note above. Route agents to Field Collect.
          setMenuOpen(false);
          setFieldCollectOpen(true);
        }}
        onViewTenants={() => { setMenuOpen(false); setTenantsSheetOpen(true); }}
        onInvestForPartner={() => { setMenuOpen(false); setInvestForPartnerOpen(true); }}
        onViewProxyHistory={() => { setMenuOpen(false); setProxyHistoryOpen(true); }}
        onIssueReceipt={() => { setMenuOpen(false); setReceiptOpen(true); }}
        onViewLandlordMap={() => { setMenuOpen(false); setLandlordMapOpen(true); }}
        onFindRentals={() => { setMenuOpen(false); setRentalFinderOpen(true); }}
        onListEmptyHouse={() => { setMenuOpen(false); setListHouseOpen(true); }}
        onViewMyListings={() => { setMenuOpen(false); setMyListingsOpen(true); }}
        onViewSubAgents={() => { setMenuOpen(false); setSubAgentsSheetOpen(true); }}
        onShareSubAgentLink={() => { setMenuOpen(false); setShareLinkOpen(true); }}
        onManageFunders={() => { setMenuOpen(false); setFunderSheetOpen(true); }}
        onOpenPartnerDashboard={() => { setMenuOpen(false); setPartnerDashboardOpen(true); }}
        onOpenRequisition={() => { setMenuOpen(false); setRequisitionOpen(true); }}
        onAngelPoolInvest={() => { setMenuOpen(false); setAngelPoolInvestOpen(true); }}
        isFinancialAgent={isFinancialAgent}
        onInviteFunder={async () => {
          setMenuOpen(false);
          try {
            const { toast } = await import('sonner');
            toast.info('Generating short link...');
            const { createShortLink } = await import('@/lib/createShortLink');
            const funderLink = await createShortLink(user.id, '/funder-onboarding', { ref: user.id });
            const shareText = `Join Welile as a funder and start earning! Sign up here: ${funderLink}`;
            if (navigator.share) {
              navigator.share({ title: 'Become a Welile Funder', text: shareText, url: funderLink }).catch(() => {});
            } else {
              await navigator.clipboard.writeText(funderLink);
              toast.success('Funder signup link copied!');
            }
          } catch (err: any) {
            const { toast } = await import('sonner');
            toast.error(err.message || 'Failed to generate link');
          }
        }}
        onInviteAngelInvestor={async () => {
          setMenuOpen(false);
          try {
            const { toast } = await import('sonner');
            toast.info('Generating short link...');
            const { createShortLink } = await import('@/lib/createShortLink');
            const investorLink = await createShortLink(user.id, '/funder-onboarding', { ref: user.id, role: 'supporter' });
            const shareText = `🦄 Join the Welile Angel Pool — invest in Africa's rent-tech revolution! Own equity in a high-growth platform. Sign up here: ${investorLink}`;
            if (navigator.share) {
              navigator.share({ title: 'Invest in Welile Angel Pool', text: shareText, url: investorLink }).catch(() => {});
            } else {
              await navigator.clipboard.writeText(investorLink);
              toast.success('Angel investor signup link copied!');
            }
          } catch (err: any) {
            const { toast } = await import('sonner');
            toast.error(err.message || 'Failed to generate link');
          }
        }}
        onShareTenantForm={async () => {
          setMenuOpen(false);
          try {
            const { toast } = await import('sonner');
            toast.info('Generating shareable link...');
            const { supabase } = await import('@/integrations/supabase/client');
            const { data, error } = await supabase.functions.invoke('generate-tenant-form-token', {});
            if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed to generate link');
            const { createShortLink } = await import('@/lib/createShortLink');
            const tenantFormLink = await createShortLink(user.id, '/register-tenant', { agent: user.id, token: data.token });
            const shareText = `Register as a Welile tenant using this form: ${tenantFormLink}`;
            if (navigator.share) {
              navigator.share({ title: 'Tenant Registration', text: shareText, url: tenantFormLink }).catch(() => {});
            } else {
              await navigator.clipboard.writeText(tenantFormLink);
              toast.success('Tenant registration link copied!');
            }
          } catch (err: any) {
            const { toast } = await import('sonner');
            toast.error(err.message || 'Failed to generate link');
          }
        }}
        onSharePartnerForm={async () => {
          setMenuOpen(false);
          try {
            const { toast } = await import('sonner');
            toast.info('Generating partner form link...');
            const { supabase } = await import('@/integrations/supabase/client');
            const { data, error } = await supabase.functions.invoke('generate-tenant-form-token', {});
            if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed to generate link');
            const { createShortLink } = await import('@/lib/createShortLink');
            const partnerFormLink = await createShortLink(user.id, '/register-partner', { agent: user.id, token: data.token });
            const shareText = `🤝 Invest with Welile and earn 15% monthly ROI! Register here: ${partnerFormLink}`;
            if (navigator.share) {
              navigator.share({ title: 'Partner Registration', text: shareText, url: partnerFormLink }).catch(() => {});
            } else {
              await navigator.clipboard.writeText(partnerFormLink);
              toast.success('Partner registration link copied!');
            }
          } catch (err: any) {
            const { toast } = await import('sonner');
            toast.error(err.message || 'Failed to generate link');
          }
        }}
        onShareLandlordSignup={() => {
          setMenuOpen(false);
          handleShareLandlordSignup();
        }}
        onCreatePromissoryNote={() => {
          setMenuOpen(false);
          setPromissoryNoteOpen(true);
        }}
        onViewPromissoryNotes={() => {
          setMenuOpen(false);
          setPromissoryListOpen(true);
        }}
        onRequestAdvance={() => {
          setMenuOpen(false);
          setAdvanceRequestOpen(true);
        }}
      />

      {/* Existing Dialogs */}
      <AgentDepositDialog open={depositOpen} onOpenChange={setDepositOpen} />
      <UnifiedRegistrationDialog 
        open={registerUserOpen} 
        onOpenChange={setRegisterUserOpen}
        onSuccess={() => { refreshOfflineData(); refreshEarnings(); }}
      />
      <RegisterSubAgentDialog
        open={inviteSubAgentOpen}
        onOpenChange={setInviteSubAgentOpen}
        onSuccess={() => { refreshOfflineData(); refreshEarnings(); }}
      />
      <AgentRentRequestDialog 
        open={rentRequestOpen} 
        onOpenChange={setRentRequestOpen} 
        onSuccess={() => setRentRequestOpen(false)}
      />
      <BusinessAdvanceRequestDialog
        open={businessAdvanceOpen}
        onOpenChange={setBusinessAdvanceOpen}
        onSuccess={() => refreshOfflineData()}
      />
      <CommissionCelebrationModal
        open={!!commissionEvent}
        onClose={dismissCommission}
        amount={commissionEvent?.amount || 0}
        businessName={commissionEvent?.businessName}
        repaymentAmount={commissionEvent?.repaymentAmount}
      />
      <EarningsRankSystemSheet open={earningsRankOpen} onOpenChange={setEarningsRankOpen} />
      <AgentManagedPropertyDialog open={managedPropertyOpen} onOpenChange={setManagedPropertyOpen} onSuccess={refreshOfflineData} />
      <AgentManagedPropertiesSheet open={managedPropertiesSheetOpen} onOpenChange={setManagedPropertiesSheetOpen} onRequestPayout={(p) => { setPayoutProperty(p); setPayoutDialogOpen(true); }} />
      <AgentLandlordPayoutDialog open={payoutDialogOpen} onOpenChange={setPayoutDialogOpen} property={payoutProperty} />
      <AgentLandlordPayoutFlow open={landlordPayoutFlowOpen} onOpenChange={setLandlordPayoutFlowOpen} />
      <AgentFloatPayoutWizard open={floatPayoutOpen} onOpenChange={setFloatPayoutOpen} />
      <AgentLandlordFloatAllocationsDialog
        open={floatAllocationsOpen}
        onOpenChange={setFloatAllocationsOpen}
        onSelectAllocation={() => {
          setFloatAllocationsOpen(false);
          setFloatPayoutOpen(true);
        }}
      />
      <LandlordRecoveryLedger open={recoveryLedgerOpen} onOpenChange={setRecoveryLedgerOpen} />
      <FloatPayoutStatusTracker open={payoutStatusOpen} onOpenChange={setPayoutStatusOpen} />
      <FloatTransactionHistory open={floatHistoryOpen} onOpenChange={setFloatHistoryOpen} />
      <VerificationOpportunitiesButton />
      <CreditVerificationButton />
      <AgentMyRentRequestsSheet open={myRentRequestsOpen} onOpenChange={setMyRentRequestsOpen} />
      <AgentTenantsSheet open={tenantsSheetOpen} onOpenChange={setTenantsSheetOpen} />
      <FieldCollectDialog open={fieldCollectOpen} onOpenChange={setFieldCollectOpen} />
      <FieldCollectFab onClick={() => setFieldCollectOpen(true)} />
      <FieldCollectReconciliationSheet open={reconcileOpen} onOpenChange={setReconcileOpen} />
      <AgentManagedUsersSheet open={managedUsersOpen} onOpenChange={setManagedUsersOpen} agentId={user.id} />
      <AgentTopUpTenantDialog open={topUpTenantOpen} onOpenChange={setTopUpTenantOpen} onSuccess={refreshOfflineData} />
      <AgentInvestForPartnerDialog open={investForPartnerOpen} onOpenChange={setInvestForPartnerOpen} onSuccess={() => { refreshOfflineData(); refreshWallet(); }} />
      <ProxyInvestmentHistorySheet open={proxyHistoryOpen} onOpenChange={setProxyHistoryOpen} />
      <AgentAngelPoolInvestDialog open={angelPoolInvestOpen} onOpenChange={setAngelPoolInvestOpen} onSuccess={() => { refreshOfflineData(); refreshWallet(); }} />
      <AgentReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} />
      <AgentLandlordMapSheet open={landlordMapOpen} onOpenChange={setLandlordMapOpen} />
      <RentalFinderSheet open={rentalFinderOpen} onOpenChange={setRentalFinderOpen} />
      <ListEmptyHouseDialog open={listHouseOpen} onOpenChange={setListHouseOpen} onSuccess={refreshOfflineData} />
      <AgentListingsSheet
        open={myListingsOpen}
        onOpenChange={setMyListingsOpen}
        onListHouse={() => setListHouseOpen(true)}
      />

      {/* Phase 1: Agent Operations Dialogs */}
      <AgentVisitPaymentWizard open={visitDialogOpen} onOpenChange={setVisitDialogOpen} onSuccess={refreshOfflineData} />
      <GeneratePaymentTokenDialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen} />
      <RecordAgentCollectionDialog open={recordCollectionOpen} onOpenChange={setRecordCollectionOpen} />
      <AgentDepositCashDialog open={depositCashOpen} onOpenChange={setDepositCashOpen} />
      <NearbyTenantsSheet open={nearbyTenantsOpen} onOpenChange={setNearbyTenantsOpen} />
      <MySubAgentsSheet open={subAgentsSheetOpen} onOpenChange={setSubAgentsSheetOpen} />
      <QuickShareSubAgentSheet open={shareLinkOpen} onOpenChange={setShareLinkOpen} />
      <ShareLandlordLinkDialog open={shareLandlordOpen} onOpenChange={setShareLandlordOpen} />
      <FunderManagementSheet open={funderSheetOpen} onOpenChange={setFunderSheetOpen} />
      <AgentPartnerDashboardSheet open={partnerDashboardOpen} onOpenChange={setPartnerDashboardOpen} />
      <FinancialAgentSection open={requisitionOpen} onOpenChange={setRequisitionOpen} />
      <LendingAgentPortal open={lendingAgentOpen} onOpenChange={setLendingAgentOpen} />

      {/* Cash Payouts Dialog - only rendered for cashout agents */}
      <Dialog open={cashPayoutsOpen} onOpenChange={setCashPayoutsOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-lg p-0 gap-0 max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="p-4 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6">
              <Banknote className="h-5 w-5 text-orange-500 shrink-0" />
              <span className="truncate">Cash & Bank Payouts</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
            <AgentCashPayoutsTab />
          </div>
        </DialogContent>
      </Dialog>

      <PromissoryNoteDialog open={promissoryNoteOpen} onOpenChange={setPromissoryNoteOpen} />
      <AgentPromissoryNotesList open={promissoryListOpen} onOpenChange={setPromissoryListOpen} />
      <AgentAdvanceRequestForm open={advanceRequestOpen} onOpenChange={setAdvanceRequestOpen} />

    </div>
  );
}
