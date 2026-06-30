import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { User } from '@supabase/supabase-js';

import AiIdButton from '@/components/ai-id/AiIdButton';
import { UnifiedWalletHeroCard } from '@/components/wallet/UnifiedWalletHeroCard';
import { AgentRiskExposureCard } from '@/components/agent/AgentRiskExposureCard';
import { AgentCompanyDebtCard } from '@/components/agent/AgentCompanyDebtCard';
import { AgentMyAdvancesCard } from '@/components/agent/AgentMyAdvancesCard';
import { EarnedSinceLastWithdrawalCard } from '@/components/agent/EarnedSinceLastWithdrawalCard';
import { EarningsSummaryCard } from '@/components/agent/EarningsSummaryCard';
import { AgentWalletDetailsCard } from '@/components/agent/AgentWalletDetailsCard';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
  Send,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Wallet, Landmark, LayoutDashboard, ChevronRight } from 'lucide-react';
import { HandCoins } from 'lucide-react';
import { ShieldCheck } from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
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
import { MyParentAgentCard } from '@/components/agent/MyParentAgentCard';
import AgentRentRequestDialog from '@/components/agent/AgentRentRequestDialog';
import SavedRentDraftsPanel from '@/components/agent/SavedRentDraftsPanel';
import BusinessAdvanceRequestDialog from '@/components/agent/BusinessAdvanceRequestDialog';
import { CommissionCelebrationModal } from '@/components/agent/CommissionCelebrationModal';
import { useBusinessAdvanceCommissionListener } from '@/hooks/useBusinessAdvanceCommissionListener';
import { useAgentUnblockToast } from '@/hooks/useAgentUnblockToast';
import { useRecruiterOverrideToast } from '@/hooks/useRecruiterOverrideToast';
import { useAgentEarnings } from '@/hooks/useAgentEarnings';
import { AgentDashboardSkeleton } from '@/components/skeletons/DashboardSkeletons';
import { WalletHeroSkeleton, MetricRowSkeleton, ListSectionSkeleton } from '@/components/skeletons/SectionSkeletons';


import { hapticTap } from '@/lib/haptics';
import { AgentAgreementBanner } from '@/components/agent/agreement';
import { AgentPaymentEditAlert } from '@/components/agent/AgentPaymentEditAlert';
import { AgentRejectedLandlordsPanel } from '@/components/agent/AgentRejectedLandlordsPanel';
import { AgentDeadTenantsBanner } from '@/components/agent/AgentDeadTenantsBanner';
import { VerificationChecklist } from '@/components/shared/VerificationChecklist';
import { useOffline } from '@/contexts/OfflineContext';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PendingDraftsBanner } from '@/components/agent/PendingDraftsBanner';
import { DashboardDataErrorBanner } from '@/components/dashboards/DashboardDataErrorBanner';
import { useOfflineAgentDashboard } from '@/hooks/useOfflineAgentDashboard';
import { useWallet } from '@/hooks/useWallet';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { useAgentLandlordFloat } from '@/hooks/useAgentLandlordFloat';
import { useAgentDashboardRealtime } from '@/hooks/useAgentDashboardRealtime';
import { EarningsRankSystemSheet } from '@/components/agent/EarningsRankSystemSheet';
import { AgentMenuDrawer } from '@/components/agent/AgentMenuDrawer';
import { AgentHubTabs, type AgentHubTab } from '@/components/agent/AgentHubTabs';
import { useHorizontalSwipe } from '@/hooks/useHorizontalSwipe';
import { AgentActionInsights } from '@/components/agent/AgentActionInsights';
import { AgentManagedPropertyDialog } from '@/components/agent/AgentManagedPropertyDialog';
import { AgentManagedPropertiesSheet } from '@/components/agent/AgentManagedPropertiesSheet';
import { AgentLandlordPayoutDialog } from '@/components/agent/AgentLandlordPayoutDialog';
import { AgentLandlordPayoutFlow } from '@/components/agent/AgentLandlordPayoutFlow';
import { AgentLandlordFloatCard } from '@/components/agent/AgentLandlordFloatCard';
import { AgentPendingReceiptPanel } from '@/components/agent/AgentPendingReceiptPanel';
import { AgentTenantHealthCard } from '@/components/agent/AgentTenantHealthCard';
import { AgentVouchHighlightCard } from '@/components/agent/AgentVouchHighlightCard';
import { AgentFloatPayoutWizard } from '@/components/agent/AgentFloatPayoutWizard';
import { AgentLandlordFloatAllocationsDialog } from '@/components/agent/AgentLandlordFloatAllocationsDialog';
import type { LandlordFloatAllocation } from '@/hooks/useLandlordFloatAllocations';
import { LandlordRecoveryLedger } from '@/components/agent/LandlordRecoveryLedger';
import { FloatPayoutStatusTracker } from '@/components/agent/FloatPayoutStatusTracker';
import { LandlordPayoutOtpAuditSheet } from '@/components/agent/LandlordPayoutOtpAuditSheet';
import { FloatTransactionHistory } from '@/components/agent/FloatTransactionHistory';

import { AgentNotificationBell } from '@/components/agent/AgentNotificationBell';
import { DeviceSessionIndicator } from '@/components/agent/DeviceSessionIndicator';
import { CreditVerificationButton } from '@/components/agent/CreditVerificationButton';
import { AgentMyRentRequestsSheet } from '@/components/agent/AgentMyRentRequestsSheet';
import { AgentTenantsSheet } from '@/components/agent/AgentTenantsSheet';
import { AgentRequestPipelineView, type PipelineTab } from '@/components/agent/AgentRequestPipelineView';
import { useAgentPipelineCounts } from '@/hooks/useAgentPipelineCounts';
import { AgentManagedUsersSheet } from '@/components/agent/AgentManagedUsersSheet';
import { FieldCollectDialog } from '@/components/agent/FieldCollectDialog';

import { FieldCollectReconciliationSheet } from '@/components/agent/FieldCollectReconciliationSheet';
import { getDuplicateEntries } from '@/lib/fieldCollectStore';
import { FileWarning } from 'lucide-react';
import { FieldCollectDailyTotals } from '@/components/agent/FieldCollectDailyTotals';
import { FieldCollectCard } from '@/components/agent/FieldCollectCard';
import { FieldDepositQueueCard } from '@/components/agent/FieldDepositQueueCard';
import { CollectFromReferenceDialog } from '@/components/agent/CollectFromReferenceDialog';

import { AgentTopUpTenantDialog } from '@/components/agent/AgentTopUpTenantDialog';
import { AgentRatingCard } from '@/components/agent/AgentRatingCard';
import { AgentInvestForPartnerDialog } from '@/components/agent/AgentInvestForPartnerDialog';
import { AgentAngelPoolInvestDialog } from '@/components/agent/AgentAngelPoolInvestDialog';
import { ProxyInvestmentHistorySheet } from '@/components/agent/ProxyInvestmentHistorySheet';
import { AgentReceiptDialog } from '@/components/agent/AgentReceiptDialog';
import { AgentLandlordMapSheet } from '@/components/agent/AgentLandlordMapSheet';
import { RentalFinderSheet } from '@/components/agent/RentalFinderSheet';
import { ListEmptyHouseDialog } from '@/components/agent/ListEmptyHouseDialog';
import { AgentLandlordPromoBanner } from '@/components/agent/AgentLandlordPromoBanner';
import { AgentListingsSheet } from '@/components/agent/AgentListingsSheet';
import { NearbyTenantsSheet } from '@/components/agent/NearbyTenantsSheet';
import { MySubAgentsSheet } from '@/components/agent/MySubAgentsSheet';
import { MyLandlordsSheet } from '@/components/agent/MyLandlordsSheet';
import { RecruitSubAgentCTA } from '@/components/agent/RecruitSubAgentCTA';
import { QuickShareSubAgentSheet } from '@/components/agent/QuickShareSubAgentSheet';
import { ShareLandlordLinkDialog } from '@/components/agent/ShareLandlordLinkDialog';
import { FunderManagementSheet } from '@/components/agent/FunderManagementSheet';
import { AgentPartnerDashboardSheet } from '@/components/agent/AgentPartnerDashboardSheet';
import { CreditAccessCard } from '@/components/CreditAccessCard';
import { ApprovedRentRequestsWidget } from '@/components/rent/ApprovedRentRequestsWidget';
import { RecentAutoCharges } from '@/components/wallet/RecentAutoCharges';
import { StuckDepositsRepairPanel } from '@/components/wallet/StuckDepositsRepairPanel';
import { AgentTenantRentRequestsList } from '@/components/agent/AgentTenantRentRequestsList';

import { ShareRentRecorderCard } from '@/components/agent/ShareRentRecorderCard';
import { TodayCollectionsCard } from '@/components/agent/TodayCollectionsCard';
import { AgentPriorityGrid } from '@/components/agent/AgentPriorityGrid';
import { AgentTenantInlineList } from '@/components/agent/AgentTenantInlineList';
import { AgentCapacityShareInline } from '@/components/agent/AgentCapacityShareInline';
import { AgentDailyCardEmailPrompt } from '@/components/agent/AgentDailyCardEmailPrompt';
import { useIsFinancialAgent } from '@/hooks/useIsFinancialAgent';
import { FinancialAgentSection } from '@/components/agent/FinancialAgentSection';
import { PromissoryNoteDialog } from '@/components/agent/PromissoryNoteDialog';
import { AgentPromissoryNotesList } from '@/components/agent/AgentPromissoryNotesList';
import { AgentAdvanceRequestForm } from '@/components/agent/AgentAdvanceRequestForm';
import LendingAgentPortal from '@/components/vouch/agent/LendingAgentPortal';
import BorrowLoanSheet from '@/components/vouch/borrower/BorrowLoanSheet';
import RentPosterDialog from '@/components/agent/RentPosterDialog';

// PDF form generators
import {
  generateLandlordRegistrationFormPdf,
  shareLandlordRegistrationFormPdf,
} from '@/lib/landlordRegistrationFormPdf';
import {
  generateTenantRegistrationFormPdf,
  shareTenantRegistrationFormPdf,
} from '@/lib/tenantRegistrationFormPdf';

// New Phase 1 components
import { AgentDailyOpsCard } from '@/components/agent/AgentDailyOpsCard';
import { AgentCashDepositCodesPanel } from '@/components/agent/AgentCashDepositCodesPanel';
import { AgentVisitPaymentWizard } from '@/components/agent/AgentVisitPaymentWizard';
import { GeneratePaymentTokenDialog } from '@/components/agent/GeneratePaymentTokenDialog';
import { RecordAgentCollectionDialog } from '@/components/agent/RecordAgentCollectionDialog';
import { AgentDepositCashDialog } from '@/components/agent/AgentDepositCashDialog';
import { AgentCashPayoutsTab } from '@/components/agent/AgentCashPayoutsTab';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MissionBanner } from '@/components/mission/MissionBanner';

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
  const { profile, loading: profileLoading } = useProfile();
  // Celebratory toast the moment the agent crosses today's 20% eligibility
  // threshold (fires once per Kampala day, on mount or via realtime).
  useAgentUnblockToast(user?.id);
  // Success / error toast when a UGX 3,000 recruiter override payout is created
  // for this agent (a verified sub-agent listing / landlord / LC1 chairperson).
  useRecruiterOverrideToast(user?.id);
  const { refreshEarnings, totalEarnings } = useAgentEarnings();
  const { wallet, refreshWallet, loading: walletLoading } = useWallet();
  const { commissionBalance, withdrawableBalance, otherBalance, refetch: refreshBalances, isLoading: balancesLoading } = useAgentBalances();
  const { floatBalance: walletFloatBalance } = useAgentBalances();
  // Kept for the lower AgentLandlordFloatCard / sheets (CFO escrow, NOT the wallet float)
  const { floatBalance: landlordPayoutFloat, isLoading: floatLoading } = useAgentLandlordFloat();
  const { isOnline } = useOffline();

  // Instant mobile dashboard refresh: one debounced channel listens for any
  // agent-scoped commission, wallet movement, or float change and re-pulls
  // the headline numbers so the agent sees money arrive without reloading.
  useAgentDashboardRealtime({
    agentId: user?.id,
    onChange: () => {
      void refreshWallet();
      void refreshBalances();
      void refreshEarnings();
    },
  });
  
  const { 
    stats, 
    isLoading: loading, 
    refreshData: refreshOfflineData, 
    hasLoadedOnce,
    loadError,
  } = useOfflineAgentDashboard();
  
  const { tenantsCount, referralCount, subAgentCount } = stats;
  
  const [depositOpen, setDepositOpen] = useState(false);
  // Global "open deposit" entry: triggered from the mobile bottom-nav Deposit
  // FAB and from `?deposit=1` deep-links so the agent can reach the deposit
  // flow in one tap from anywhere in the app.
  useEffect(() => {
    const handler = () => setDepositOpen(true);
    window.addEventListener('open-deposit', handler);
    return () => window.removeEventListener('open-deposit', handler);
  }, []);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('deposit') === '1') {
        setDepositOpen(true);
        params.delete('deposit');
        const qs = params.toString();
        window.history.replaceState(
          {},
          '',
          window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
        );
      }
    } catch { /* ignore */ }
  }, []);
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
  // When an agent taps a specific tenant in the inline list, open the sheet
  // straight into that tenant's profile (payments + outstanding balance).
  const [tenantProfileId, setTenantProfileId] = useState<string | undefined>(undefined);
  // When opening the submissions sheet via the global "open-submissions" event
  // (fired from registration success screens), remember which view/tab to land on.
  const [submissionsView, setSubmissionsView] = useState<'tenants' | 'pipeline' | undefined>(undefined);
  const [submissionsTab, setSubmissionsTab] = useState<'submitted' | 'approved' | 'rejected' | 'landlords' | undefined>(undefined);
  const [submissionsHighlightId, setSubmissionsHighlightId] = useState<string | undefined>(undefined);
  const [pipelineTab, setPipelineTab] = useState<PipelineTab>('submitted');
  const [submissionsExpanded, setSubmissionsExpanded] = useState(false);
  const { submittedCount, approvedCount, rejectedCount, isLoading: countsLoading } = useAgentPipelineCounts();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { tab?: 'submitted' | 'approved' | 'rejected' | 'landlords'; recordId?: string } | undefined;
      setSubmissionsView('pipeline');
      setSubmissionsTab(detail?.tab ?? 'submitted');
      setSubmissionsHighlightId(detail?.recordId ?? undefined);
      setTenantsSheetOpen(true);
    };
    window.addEventListener('open-submissions', handler);
    return () => window.removeEventListener('open-submissions', handler);
  }, []);
  // Deep-link support: opening /dashboard/agent?submission=<id>&type=tenant|landlord
  // jumps straight to that record in the submissions sheet, so the copyable
  // link an agent shares after registering actually lands on the record.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const recordId = params.get('submission');
    if (!recordId) return;
    const type = params.get('type');
    setSubmissionsView('pipeline');
    setSubmissionsTab(type === 'landlord' ? 'landlords' : 'submitted');
    setSubmissionsHighlightId(recordId);
    setTenantsSheetOpen(true);
    // Strip the params so a refresh / back doesn't re-trigger the sheet.
    params.delete('submission');
    params.delete('type');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);
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
  const [listHouseFromPromo, setListHouseFromPromo] = useState(false);
  const [myListingsOpen, setMyListingsOpen] = useState(false);
  const [myListingsVacantOnly, setMyListingsVacantOnly] = useState(false);

  // Phase 1: Agent Operations dialogs
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [recordCollectionOpen, setRecordCollectionOpen] = useState(false);
  const [depositCashOpen, setDepositCashOpen] = useState(false);
  const [nearbyTenantsOpen, setNearbyTenantsOpen] = useState(false);
  const [applyingToSell, setApplyingToSell] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [subAgentsSheetOpen, setSubAgentsSheetOpen] = useState(false);
  const [landlordsSheetOpen, setLandlordsSheetOpen] = useState(false);
  const [managedUsersOpen, setManagedUsersOpen] = useState(false);
  const [shareLinkOpen, setShareLinkOpen] = useState(false);
  const [funderSheetOpen, setFunderSheetOpen] = useState(false);
  const [partnerDashboardOpen, setPartnerDashboardOpen] = useState(false);
  const [cashPayoutsOpen, setCashPayoutsOpen] = useState(false);
  const [landlordPayoutFlowOpen, setLandlordPayoutFlowOpen] = useState(false);
  const [floatPayoutOpen, setFloatPayoutOpen] = useState(false);
  const [floatAllocationsOpen, setFloatAllocationsOpen] = useState(false);
  const [selectedFloatAllocation, setSelectedFloatAllocation] = useState<LandlordFloatAllocation | null>(null);
  const [recoveryLedgerOpen, setRecoveryLedgerOpen] = useState(false);
  const [payoutStatusOpen, setPayoutStatusOpen] = useState(false);
  const [otpAuditOpen, setOtpAuditOpen] = useState(false);
  const [floatHistoryOpen, setFloatHistoryOpen] = useState(false);
  const [requisitionOpen, setRequisitionOpen] = useState(false);
  const [angelPoolInvestOpen, setAngelPoolInvestOpen] = useState(false);
  const [promissoryNoteOpen, setPromissoryNoteOpen] = useState(false);
  const [rentPosterOpen, setRentPosterOpen] = useState(false);
  const [promissoryListOpen, setPromissoryListOpen] = useState(false);
  const [advanceRequestOpen, setAdvanceRequestOpen] = useState(false);
  const [shareLandlordOpen, setShareLandlordOpen] = useState(false);
  const [lendingAgentOpen, setLendingAgentOpen] = useState(false);
  const [borrowOpen, setBorrowOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentHubTab>('home');
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);

  // Horizontal swipe → switch hub tabs (mobile gesture)
  const TAB_ORDER: AgentHubTab[] = ['home', 'money', 'tenants', 'grow', 'subagents'];
  const swipeHandlers = useHorizontalSwipe({
    onSwipeLeft: () => {
      const i = TAB_ORDER.indexOf(activeTab);
      if (i < TAB_ORDER.length - 1) { hapticTap(); setSlideDirection('left'); setActiveTab(TAB_ORDER[i + 1]); }
    },
    onSwipeRight: () => {
      const i = TAB_ORDER.indexOf(activeTab);
      if (i > 0) { hapticTap(); setSlideDirection('right'); setActiveTab(TAB_ORDER[i - 1]); }
    },
  });

  const tabAnimClass = slideDirection === 'left'
    ? 'animate-slide-in-right'
    : slideDirection === 'right'
      ? 'animate-slide-in-left'
      : 'animate-in fade-in duration-200';

  // Announce tab changes to screen readers when triggered by swipe gestures
  const [tabAnnounce, setTabAnnounce] = useState('');
  useEffect(() => {
    if (slideDirection) {
      const labelMap: Record<AgentHubTab, string> = {
        home: 'Home',
        money: 'Money',
        tenants: 'Tenants',
        grow: 'Grow',
        subagents: 'Sub Agents',
      };
      setTabAnnounce(`Switched to ${labelMap[activeTab]} section`);
      setSlideDirection(null);
    }
  }, [activeTab]);

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

  // Pending (unclaimed) merchant payouts + the commission this agent would earn
  // if they claimed and processed them all. Drives the notification badge that
  // sits on top of the "Merchant Payouts" button. 0.5% commission per payout,
  // matching approve-withdrawal.
  const CASHOUT_QUEUE_STATUSES = ['pending', 'requested', 'manager_approved', 'cfo_approved', 'fin_ops_approved'];
  const CLAIM_WINDOW_MS = 15 * 60 * 1000;
  const COMMISSION_RATE = 0.005;
  const { data: pendingEarnings } = useQuery({
    queryKey: ['cashout-pending-earnings', user.id],
    enabled: !!isCashoutAgent,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      const cutoffIso = new Date(Date.now() - CLAIM_WINDOW_MS).toISOString();
      // Available = unclaimed OR a claim that has expired (>15 min).
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('amount')
        .in('status', CASHOUT_QUEUE_STATUSES)
        .or(`assigned_cashout_agent_id.is.null,dispatched_at.lt.${cutoffIso}`)
        .limit(2000);
      if (error) return { count: 0, totalCommission: 0 };
      const rows = data || [];
      const totalCommission = rows.reduce(
        (sum, r) => sum + Math.round(Number(r.amount || 0) * COMMISSION_RATE),
        0,
      );
      return { count: rows.length, totalCommission };
    },
  });

  // One-time onboarding banner shown the first time an agent becomes a Merchant Agent
  const merchantOnboardKey = `merchant-agent-onboarded:${user.id}`;
  const [showMerchantOnboard, setShowMerchantOnboard] = useState(false);
  useEffect(() => {
    if (isCashoutAgent && typeof window !== 'undefined') {
      setShowMerchantOnboard(localStorage.getItem(merchantOnboardKey) !== '1');
    }
  }, [isCashoutAgent, merchantOnboardKey]);
  const dismissMerchantOnboard = () => {
    try { localStorage.setItem(merchantOnboardKey, '1'); } catch { /* ignore */ }
    setShowMerchantOnboard(false);
  };

  // Guided click: scroll to and briefly highlight the Merchant Payouts button
  const merchantBtnRef = useRef<HTMLButtonElement>(null);
  const merchantCloseBtnRef = useRef<HTMLButtonElement>(null);
  const [highlightMerchant, setHighlightMerchant] = useState(false);
  const guideToMerchantButton = () => {
    hapticTap();
    const previousFocus = document.activeElement as HTMLElement | null;
    merchantBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightMerchant(true);
    window.setTimeout(() => {
      setHighlightMerchant(false);
      // Restore focus to the banner close button or last focused element
      (previousFocus && document.contains(previousFocus)
        ? previousFocus
        : merchantCloseBtnRef.current
      )?.focus();
    }, 2200);
    // Move keyboard focus to the button after smooth-scroll settles
    window.setTimeout(() => merchantBtnRef.current?.focus(), 600);
  };

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
  const moneyTabLoading = walletLoading || balancesLoading || floatLoading;

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

  // Downloadable PDF form handlers
  const handleDownloadLandlordForm = async () => {
    hapticTap();
    setMenuOpen(false);
    try {
      const { toast } = await import('sonner');
      toast.info('Preparing landlord form...');
      const blob = await generateLandlordRegistrationFormPdf();
      // Native share sheet attaches the PDF (WhatsApp on mobile); otherwise the
      // file downloads and a WhatsApp deep link opens for manual attach.
      const result = await shareLandlordRegistrationFormPdf(blob);
      if (result === 'deeplink') {
        toast.success('Form downloaded — attach it in WhatsApp');
      }
    } catch {
      const { toast } = await import('sonner');
      toast.error('Could not generate form');
    }
  };

  const handleDownloadTenantForm = async () => {
    hapticTap();
    setMenuOpen(false);
    try {
      const { toast } = await import('sonner');
      toast.info('Preparing tenant form...');
      const blob = await generateTenantRegistrationFormPdf();
      // Native share sheet attaches the PDF (WhatsApp on mobile); otherwise the
      // file downloads and a WhatsApp deep link opens for manual attach.
      const result = await shareTenantRegistrationFormPdf(blob);
      if (result === 'deeplink') {
        toast.success('Form downloaded — attach it in WhatsApp');
      }
    } catch {
      const { toast } = await import('sonner');
      toast.error('Could not generate form');
    }
  };

  const handleViewWallet = () => { hapticTap(); setShowWallet(true); };
  const handleOpenMenu = () => { hapticTap(); setMenuOpen(true); };

  const menuItems = [
    { icon: UserPlus, label: 'Register User', onClick: handleRegisterUser },
  ];

  const quickActions = [] as any[];

  return (
    <div className="agent-dashboard-shell h-[100dvh] bg-background flex flex-col overflow-hidden">
      <OfflineBanner />
      <PendingDraftsBanner />
      <DashboardDataErrorBanner
        message={loadError}
        hasCachedData={hasLoadedOnce}
        onRetry={handleRefresh}
      />
      
      <DashboardHeader
        currentRole={currentRole}
        availableRoles={availableRoles}
        onRoleChange={onRoleChange}
        onSignOut={signOut}
        menuItems={menuItems}
      />

      <div className="agent-dashboard-scroll flex-1 overflow-y-auto overflow-x-hidden pb-nav">
        <main className="agent-dashboard-main w-full min-w-0 px-4 pt-5 pb-16 space-y-5 max-w-lg mx-auto">
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
        <MissionBanner dashboardRole="agent" />
        <AgentPaymentEditAlert agentId={user.id} />

        {/* Landlord verification rejections — edit & resubmit, or dismiss */}
        <AgentRejectedLandlordsPanel />

        {/* Linked-but-uncredited deposits — surfaces stuck float receipts */}
        <AgentPendingReceiptPanel />

        {/* Profile + Name + AI ID */}
        {profileLoading && !profile ? (
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        ) : (
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
        )}

        {/* Active devices / multi-session indicator */}
        <div className="flex justify-end -mt-2">
          <DeviceSessionIndicator userId={user.id} />
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

        {/* Live cash-with-agent deposit codes targeting this agent */}
        <AgentCashDepositCodesPanel />

        {/* Tab Navigation — sticky so it stays under the header and never collides with the fixed bottom role switcher */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background border-b border-border/40">
          <AgentHubTabs
            active={activeTab}
            onChange={(tab) => {
              // Tapping the "Sub Agents" icon opens the full team analytics page
              // rather than the inline panel.
              if (tab === 'subagents') { navigate('/sub-agents'); return; }
              setSlideDirection(null);
              setActiveTab(tab);
            }}
          />
        </div>

        {/* Screen-reader live region announces the active hub tab after a swipe gesture */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {tabAnnounce}
        </div>

        {/* Swipe surface — left/right gestures navigate adjacent hub tabs */}
        <div {...swipeHandlers} className="touch-pan-y">
        {/* === HOME TAB === Most-used actions, at-a-glance */}
        {activeTab === 'home' && (
          <div className={cn("space-y-4", tabAnimClass)}>
            {/*
             * Minimalist home: priorities lead → today's total → urgent alerts →
             * secondary shortcuts → single "Grow" button. Everything else
             * (advances, lending, sub-agents, partners, etc.) lives behind the
             * "Grow" button via AgentMenuDrawer so no functionality is lost.
             */}

            {/* 0) PROMO — prominent weekly landlord registration drive */}
            <AgentLandlordPromoBanner onRegisterLandlord={() => { hapticTap(); setListHouseFromPromo(true); setListHouseOpen(true); }} />

            {/* 0b) MERCHANT AGENT — highest prominence, full-bleed gradient CTA */}
            {isCashoutAgent && showMerchantOnboard && (
              <div className="w-full rounded-2xl border border-primary/30 bg-primary/5 p-4 relative animate-fade-in">
                <button
                  ref={merchantCloseBtnRef}
                  onClick={dismissMerchantOnboard}
                  aria-label="Dismiss"
                  className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors touch-manipulation"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-start gap-3 pr-6">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground">You're now a Merchant Agent!</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Use the highlighted <span className="font-medium text-foreground">Merchant Payouts</span> button
                      below to process MoMo, bank{isCashoutAgent.handles_cash ? ', and cash' : ''} payouts for customers.
                      Tap it any time to get started.
                    </p>
                    <button
                      onClick={guideToMerchantButton}
                      className="mt-3 text-xs font-semibold text-primary hover:underline"
                    >
                      Show me where →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isCashoutAgent && (
              <button
                ref={merchantBtnRef}
                onClick={() => { hapticTap(); setCashPayoutsOpen(true); }}
                className={cn(
                  "w-full flex items-center gap-4 p-5 rounded-2xl border border-warning/60 bg-gradient-to-br from-warning to-amber-600 shadow-lg shadow-warning/20 touch-manipulation active:scale-[0.97] transition-all min-h-[72px] relative overflow-hidden",
                  highlightMerchant && "ring-4 ring-primary ring-offset-2 ring-offset-background animate-pulse scale-[1.02]"
                )}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {/* subtle shimmer strip */}
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                <div className="p-3 rounded-xl bg-white/20 shrink-0 backdrop-blur-sm">
                  <Banknote className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 text-left min-w-0 relative">
                  <p className="font-bold text-base text-white truncate">Merchant Payouts</p>
                  <p className="text-xs text-white/80 truncate">
                    {pendingEarnings && pendingEarnings.count > 0
                      ? `${pendingEarnings.count} unclaimed ${pendingEarnings.count === 1 ? 'request' : 'requests'} waiting`
                      : `MoMo · Bank${isCashoutAgent.handles_cash ? ' · Cash' : ''}`}
                  </p>
                </div>
                {pendingEarnings && pendingEarnings.totalCommission > 0 ? (
                  <div className="shrink-0 relative flex flex-col items-end justify-center rounded-2xl bg-white px-4 py-2.5 shadow-lg ring-2 ring-emerald-600/30">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 leading-none">You earn</span>
                    <span className="text-2xl sm:text-3xl font-black text-emerald-700 leading-tight tabular-nums">
                      {formatUGX(pendingEarnings.totalCommission)}
                    </span>
                  </div>
                ) : (
                  <span className="text-base font-bold text-white shrink-0 relative">Open →</span>
                )}
              </button>
            )}

            {/* 1) Priorities first — Wallet · Collect Rent · Add Tenant · List House */}
            <AgentPriorityGrid
              agentId={user.id}
              withdrawable={realWithdrawableBalance}
              onOpenWallet={() => { hapticTap(); setShowWallet(true); }}
              onOpenFieldCollect={() => setFieldCollectOpen(true)}
              onOpenNewTenant={() => setRentRequestOpen(true)}
              onOpenListHouse={() => { hapticTap(); setListHouseFromPromo(false); setListHouseOpen(true); }}
            />

            {/* 2) Today's collected total — single most useful at-a-glance number */}
            <FieldCollectDailyTotals live />

            {/* 2b) Earnings summary — available rewards + lifetime total */}
            <EarningsSummaryCard />

            {/* 3) Urgent: duplicates that need reconciliation */}
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

            {/* 4) Live rating — today vs target + 7-day capacity tier */}
            <AgentRatingCard agentId={user.id} />

            {/* 5) Secondary shortcuts — collected receipt helper + my listed houses */}
            <button
              type="button"
              onClick={() => { hapticTap(); setMyListingsVacantOnly(false); setMyListingsOpen(true); }}
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

            {/*
             * Collect from a receipt / reference: paste a MoMo TID or bank ref
             * captured in the field and we auto-build the per-tenant breakdown.
             */}
            <button
              type="button"
              onClick={() => { hapticTap(); setCollectFromRefOpen(true); }}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-accent/40 active:scale-[0.99] transition-all text-left touch-manipulation min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Collect from a receipt
              </span>
              <span className="text-xs font-medium text-primary">Open →</span>
            </button>

            {/* 6) Single Grow button → reveals every other tool via the menu drawer */}
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
          <div className={cn("space-y-5", tabAnimClass)}>
            {/* Quick-access money cards: 4 clear destinations */}
            {moneyTabLoading ? (
              <MetricRowSkeleton count={4} />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    key: 'withdrawable',
                    label: 'Withdrawable Wallet',
                    sub: 'Your money you can cash out',
                    amount: withdrawableBalance,
                    icon: Wallet,
                    tone: 'text-emerald-600',
                    ring: 'ring-emerald-500/30',
                    bg: 'bg-emerald-500/10',
                    onClick: () => { hapticTap(); setShowWallet(true); },
                  },
                  {
                    key: 'operational',
                    label: 'Operational Float',
                    sub: 'Company money for rent & ops',
                    amount: walletFloatBalance,
                    icon: Banknote,
                    tone: 'text-primary',
                    ring: 'ring-primary/30',
                    bg: 'bg-primary/10',
                    onClick: () => { hapticTap(); setShowWallet(true); },
                  },
                  {
                    key: 'landlord',
                    label: 'Landlord Float',
                    sub: 'CFO funds for landlord payouts',
                    amount: landlordPayoutFloat,
                    icon: Landmark,
                    tone: 'text-[#9234EA]',
                    ring: 'ring-[#9234EA]/30',
                    bg: 'bg-[#9234EA]/10',
                    onClick: () => { hapticTap(); setFloatAllocationsOpen(true); },
                  },
                  {
                    key: 'advance',
                    label: 'Agent Advance',
                    sub: 'Welile lends you up to UGX 30M · pay back over 12 months',
                    amount: null,
                    icon: Briefcase,
                    tone: 'text-primary',
                    ring: 'ring-primary/30',
                    bg: 'bg-primary/10',
                    onClick: () => { hapticTap(); setAdvanceRequestOpen(true); },
                  },
                ].map((c) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.key}
                      onClick={c.onClick}
                      className={cn(
                        'flex flex-col items-start gap-2 p-4 rounded-2xl bg-card border border-border/60 ring-1',
                        c.ring,
                        'active:scale-[0.97] transition-all touch-manipulation text-left min-h-[112px]',
                      )}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className={cn('p-2 rounded-xl', c.bg)}>
                          <Icon className={cn('h-5 w-5', c.tone)} strokeWidth={2.2} />
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="w-full">
                        <p className="text-[13px] font-bold text-foreground leading-tight">{c.label}</p>
                        {c.amount !== null ? (
                          <p className={cn('text-base font-extrabold mt-0.5 truncate', c.tone)}>
                            {formatUGX(c.amount)}
                          </p>
                        ) : (
                          <p className="text-base font-extrabold mt-0.5 text-foreground">Open →</p>
                        )}
                        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{c.sub}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <AgentWalletDetailsCard
              agentId={user.id}
              onOpenWallet={() => { hapticTap(); setShowWallet(true); }}
            />
            <AgentCompanyDebtCard onViewBreakdown={() => { hapticTap(); setTenantsSheetOpen(true); }} />
            <AgentMyAdvancesCard />
            <AgentRiskExposureCard />
            <EarnedSinceLastWithdrawalCard />
            <AgentLandlordFloatCard
              onPayLandlord={() => { hapticTap(); setFloatAllocationsOpen(true); }}
              onOpenRecovery={() => { hapticTap(); setRecoveryLedgerOpen(true); }}
              onOpenHistory={() => { hapticTap(); setFloatHistoryOpen(true); }}
              onOpenStatusTracker={() => { hapticTap(); setPayoutStatusOpen(true); }}
              onOpenOtpAudit={() => { hapticTap(); setOtpAuditOpen(true); }}
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
                <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-600/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  <ShieldCheck className="h-3 w-3" strokeWidth={2.4} />
                  Principal 100% protected by Welile
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-700">→</span>
            </button>
            <button
              onClick={() => { hapticTap(); setBorrowOpen(true); }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/10 to-emerald-500/5 ring-1 ring-primary/30 active:scale-[0.98] transition-all touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <div className="p-2.5 rounded-xl bg-primary text-white shadow-md">
                <HandCoins className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-bold text-sm text-foreground">Borrow a Loan</div>
                <div className="text-[11px] text-muted-foreground">Browse lending agents' offers · Request a loan</div>
              </div>
              <span className="text-xs font-bold text-primary">→</span>
            </button>
            <RecentAutoCharges />
            <StuckDepositsRepairPanel agentId={user.id} />
          </div>
        )}

        {/* === TENANTS TAB === Clean tenant list with big tap targets */}
        {activeTab === 'tenants' && (
          <div className={cn("space-y-4 pb-24", tabAnimClass)}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">My Tenants</h2>
              <Button
                onClick={() => { hapticTap(); setRentRequestOpen(true); }}
                className="h-11 px-4 text-sm font-bold rounded-xl gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <UserPlus className="h-4 w-4" />
                Add Tenant
              </Button>
            </div>
            <AgentDailyCardEmailPrompt />
            <AgentCapacityShareInline />
            <AgentDeadTenantsBanner agentId={user.id} />
            <div
              className={cn(
                "sticky z-10 -mx-4 px-3 sm:px-4 bg-background/95 backdrop-blur-md border-b border-border/40 overscroll-contain",
                submissionsExpanded && "pb-2.5 max-h-[42vh] sm:max-h-[55vh] overflow-y-auto"
              )}
              style={{ top: 'calc(4.5rem + env(safe-area-inset-top, 0px))' }}
            >
              <button
                onClick={() => setSubmissionsExpanded((v) => !v)}
                className="w-full flex items-center justify-between py-2 text-left"
                style={{ touchAction: 'manipulation' }}
              >
                <h3 className="text-[11px] sm:text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  Submissions
                </h3>
                <div className="flex items-center gap-1.5">
                  {!submissionsExpanded && (
                    <div className="flex items-center gap-1">
                      {submittedCount > 0 && (
                        <span className="h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                          {submittedCount}
                        </span>
                      )}
                      {approvedCount > 0 && (
                        <span className="h-4 px-1 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">
                          {approvedCount}
                        </span>
                      )}
                      {rejectedCount > 0 && (
                        <span className="h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                          {rejectedCount}
                        </span>
                      )}
                    </div>
                  )}
                  {submissionsExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
              </button>

              {submissionsExpanded && (
                <>
                  <div className="flex gap-1.5">
                    {[
                      { key: 'submitted' as PipelineTab, label: 'Submitted', icon: Send, count: submittedCount, tone: 'bg-amber-500 text-white' },
                      { key: 'approved' as PipelineTab, label: 'Approved', icon: CheckCircle2, count: approvedCount, tone: 'bg-emerald-600 text-white' },
                      { key: 'rejected' as PipelineTab, label: 'Rejected', icon: XCircle, count: rejectedCount, tone: 'bg-destructive text-destructive-foreground' },
                    ].map((t) => {
                      const Icon = t.icon;
                      const active = pipelineTab === t.key;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setPipelineTab(t.key)}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-1 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-all ${
                            active ? t.tone + ' shadow-sm' : 'bg-muted/50 text-muted-foreground'
                          }`}
                          style={{ touchAction: 'manipulation', minHeight: '36px' }}
                        >
                          <Icon className="h-3 w-3 shrink-0" />
                          <span>{t.label}</span>
                          <span className={`min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            active ? 'bg-background/25' : 'bg-background/60'
                          }`}>
                            {countsLoading ? '·' : t.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1">
                    <AgentRequestPipelineView initialTab="submitted" activeTab={pipelineTab} onTabChange={setPipelineTab} />
                  </div>
                </>
              )}
            </div>
            <h3 className="text-[11px] sm:text-sm font-bold uppercase tracking-wide text-muted-foreground">My Tenants</h3>
            <AgentTenantInlineList
              onOpenTenantSheet={(tenantId) => { setTenantProfileId(tenantId); setTenantsSheetOpen(true); }}
              onAddTenant={() => setRentRequestOpen(true)}
            />
          </div>
        )}

        {/* === GROW TAB === Share, recruit, partners */}
        {activeTab === 'grow' && (
          <div className={cn("space-y-5", tabAnimClass)}>
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
          <div className={cn("space-y-5", tabAnimClass)}>
            <MyParentAgentCard agentId={user.id} />
            <SubAgentsPanel agentId={user.id} onInviteSubAgent={handleInviteSubAgent} />
          </div>
        )}

        </div>
        </main>
      </div>

      <FullScreenWalletSheet open={showWallet} onOpenChange={setShowWallet} />
      <DepositFlow
        open={showQuickDeposit}
        onOpenChange={setShowQuickDeposit}
        allowedPurposes={['personal_deposit', 'operational_float']}
        defaultPurpose="operational_float"
        requirePurposeChoice
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
        onViewCreditAccess={() => { setMenuOpen(false); setCreditOpen(true); }}
        onInvestForPartner={() => { setMenuOpen(false); setInvestForPartnerOpen(true); }}
        onViewProxyHistory={() => { setMenuOpen(false); setProxyHistoryOpen(true); }}
        onIssueReceipt={() => { setMenuOpen(false); setReceiptOpen(true); }}
        onViewLandlordMap={() => { setMenuOpen(false); setLandlordMapOpen(true); }}
        onFindRentals={() => { setMenuOpen(false); setRentalFinderOpen(true); }}
        onListEmptyHouse={() => { setMenuOpen(false); setListHouseFromPromo(false); setListHouseOpen(true); }}
        onViewMyListings={() => { setMenuOpen(false); setMyListingsVacantOnly(false); setMyListingsOpen(true); }}
        onViewSubAgents={() => { setMenuOpen(false); setSubAgentsSheetOpen(true); }}
        onViewLandlords={() => { setMenuOpen(false); setLandlordsSheetOpen(true); }}
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
        onDownloadLandlordForm={handleDownloadLandlordForm}
        onDownloadTenantForm={handleDownloadTenantForm}
        onOpenRentPoster={() => {
          setMenuOpen(false);
          setRentPosterOpen(true);
        }}
      />

      <RentPosterDialog open={rentPosterOpen} onOpenChange={setRentPosterOpen} />

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
      <AgentFloatPayoutWizard
        open={floatPayoutOpen}
        onOpenChange={(o) => { setFloatPayoutOpen(o); if (!o) setSelectedFloatAllocation(null); }}
        allocation={selectedFloatAllocation}
      />
      <AgentLandlordFloatAllocationsDialog
        open={floatAllocationsOpen}
        onOpenChange={setFloatAllocationsOpen}
        onSelectAllocation={(allocation) => {
          setFloatAllocationsOpen(false);
          setSelectedFloatAllocation(allocation);
          // Defer opening the payout wizard until the allocations dialog has
          // fully closed. Opening a second Radix dialog in the same tick steals
          // focus/pointer state from the closing one, which makes the wizard
          // flash open and immediately close.
          setTimeout(() => setFloatPayoutOpen(true), 250);
        }}
      />
      <LandlordRecoveryLedger open={recoveryLedgerOpen} onOpenChange={setRecoveryLedgerOpen} />
      <FloatPayoutStatusTracker open={payoutStatusOpen} onOpenChange={setPayoutStatusOpen} />
      <LandlordPayoutOtpAuditSheet open={otpAuditOpen} onOpenChange={setOtpAuditOpen} />
      <FloatTransactionHistory open={floatHistoryOpen} onOpenChange={setFloatHistoryOpen} />
      <CreditVerificationButton />
      <AgentMyRentRequestsSheet open={myRentRequestsOpen} onOpenChange={setMyRentRequestsOpen} />
      <AgentTenantsSheet
        open={tenantsSheetOpen}
        onOpenChange={(o) => {
          setTenantsSheetOpen(o);
          if (!o) {
            // Reset so normal "My tenants" opens default to the tenants view.
            setSubmissionsView(undefined);
            setSubmissionsTab(undefined);
            setSubmissionsHighlightId(undefined);
            setTenantProfileId(undefined);
          }
        }}
        initialView={submissionsView}
        initialPipelineTab={submissionsTab}
        initialHighlightId={submissionsHighlightId}
        initialProfileTenantId={tenantProfileId}
      />
      <FieldCollectDialog open={fieldCollectOpen} onOpenChange={setFieldCollectOpen} />
      
      <FieldCollectReconciliationSheet open={reconcileOpen} onOpenChange={setReconcileOpen} />
      <AgentManagedUsersSheet open={managedUsersOpen} onOpenChange={setManagedUsersOpen} agentId={user.id} />
      <AgentTopUpTenantDialog open={topUpTenantOpen} onOpenChange={setTopUpTenantOpen} onSuccess={refreshOfflineData} />
      <AgentInvestForPartnerDialog open={investForPartnerOpen} onOpenChange={setInvestForPartnerOpen} onSuccess={() => { refreshOfflineData(); refreshWallet(); }} />
      <ProxyInvestmentHistorySheet open={proxyHistoryOpen} onOpenChange={setProxyHistoryOpen} />
      <AgentAngelPoolInvestDialog open={angelPoolInvestOpen} onOpenChange={setAngelPoolInvestOpen} onSuccess={() => { refreshOfflineData(); refreshWallet(); }} />
      <AgentReceiptDialog open={receiptOpen} onOpenChange={setReceiptOpen} />
      <AgentLandlordMapSheet open={landlordMapOpen} onOpenChange={setLandlordMapOpen} />
      <RentalFinderSheet open={rentalFinderOpen} onOpenChange={setRentalFinderOpen} />
      <ListEmptyHouseDialog
        open={listHouseOpen}
        onOpenChange={(open) => {
          setListHouseOpen(open);
          if (!open) setListHouseFromPromo(false);
        }}
        onSuccess={refreshOfflineData}
        fromPromoBanner={listHouseFromPromo}
      />
      <AgentListingsSheet
        open={myListingsOpen}
        onOpenChange={(open) => {
          setMyListingsOpen(open);
          if (!open) setMyListingsVacantOnly(false);
        }}
        vacantOnly={myListingsVacantOnly}
        onListHouse={() => { setListHouseFromPromo(false); setListHouseOpen(true); }}
      />

      {/* Phase 1: Agent Operations Dialogs */}
      <AgentVisitPaymentWizard open={visitDialogOpen} onOpenChange={setVisitDialogOpen} onSuccess={refreshOfflineData} />
      <GeneratePaymentTokenDialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen} />
      <RecordAgentCollectionDialog open={recordCollectionOpen} onOpenChange={setRecordCollectionOpen} />
      <AgentDepositCashDialog open={depositCashOpen} onOpenChange={setDepositCashOpen} />
      <NearbyTenantsSheet open={nearbyTenantsOpen} onOpenChange={setNearbyTenantsOpen} />
      <MySubAgentsSheet open={subAgentsSheetOpen} onOpenChange={setSubAgentsSheetOpen} />
      <MyLandlordsSheet open={landlordsSheetOpen} onOpenChange={setLandlordsSheetOpen} />
      <QuickShareSubAgentSheet open={shareLinkOpen} onOpenChange={setShareLinkOpen} />
      <ShareLandlordLinkDialog open={shareLandlordOpen} onOpenChange={setShareLandlordOpen} />
      <FunderManagementSheet open={funderSheetOpen} onOpenChange={setFunderSheetOpen} />
      <AgentPartnerDashboardSheet open={partnerDashboardOpen} onOpenChange={setPartnerDashboardOpen} />
      <FinancialAgentSection open={requisitionOpen} onOpenChange={setRequisitionOpen} />
      <LendingAgentPortal open={lendingAgentOpen} onOpenChange={setLendingAgentOpen} />
      <BorrowLoanSheet
        open={borrowOpen}
        onOpenChange={setBorrowOpen}
        onOpenLendingPortal={() => {
          setBorrowOpen(false);
          setLendingAgentOpen(true);
        }}
      />

      {/* Rent Fee Available (Credit Access) — opened from All Menu → Earnings */}
      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-lg p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="p-4 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6">
              <TrendingUp className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">Rent Fee Available</span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto p-4">
            <CreditAccessCard userId={user.id} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Cash Payouts Dialog - only rendered for cashout agents */}
      <Dialog open={cashPayoutsOpen} onOpenChange={setCashPayoutsOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-lg p-0 gap-0 max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="p-4 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg pr-6">
              <Banknote className="h-5 w-5 text-orange-500 shrink-0" />
              <span className="truncate">Cash, Mobile Money & Bank Payouts</span>
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
