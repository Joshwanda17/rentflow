import { useEffect, useState, lazy, Suspense, type ComponentType } from 'react';
// Eagerly imported: only what's needed on the Home view.
import { WalletOverviewCard } from './WalletOverviewCard';

// Everything below is code-split — a panel's JS is only fetched when its
// tool/view is opened. Keeps /admin/financial-ops first paint fast.
const lz = (
  loader: () => Promise<Record<string, any>>,
  name: string,
): ComponentType<any> => lazy(async () => {
  const m = await loader();
  return { default: m[name] };
}) as unknown as ComponentType<any>;

const PanelFallback = () => (
  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
    Loading…
  </div>
);

const ApprovalQueue = lz(() => import('./ApprovalQueue'), 'ApprovalQueue');
const TransactionSearch = lz(() => import('./TransactionSearch'), 'TransactionSearch');
const ReconciliationDashboard = lz(() => import('./ReconciliationDashboard'), 'ReconciliationDashboard');
const AuditFeed = lz(() => import('./AuditFeed'), 'AuditFeed');
const ScaleDashboard = lz(() => import('./ScaleDashboard'), 'ScaleDashboard');
const FinOpsWithdrawalVerification = lz(() => import('./FinOpsWithdrawalVerification'), 'FinOpsWithdrawalVerification');
const EmailPayoutAutoMatchPanel = lz(() => import('./EmailPayoutAutoMatchPanel'), 'EmailPayoutAutoMatchPanel');
const LandlordPayoutsQueue = lz(() => import('./LandlordPayoutsQueue'), 'LandlordPayoutsQueue');
const LedgerHub = lz(() => import('@/components/ledgers/LedgerHub'), 'LedgerHub');
const PendingWalletOperationsWidget = lz(() => import('@/components/manager/PendingWalletOperationsWidget'), 'PendingWalletOperationsWidget');
const OfflineSubmissionsQueue = lz(() => import('./OfflineSubmissionsQueue'), 'OfflineSubmissionsQueue');
const VerifyDepositsHub = lz(() => import('./VerifyDepositsHub'), 'VerifyDepositsHub');
const MismatchMetricsPanel = lz(() => import('./MismatchMetricsPanel'), 'MismatchMetricsPanel');
const ReconciliationReviewScreen = lz(() => import('./ReconciliationReviewScreen'), 'ReconciliationReviewScreen');
const WithdrawalHistoryStatement = lz(() => import('./WithdrawalHistoryStatement'), 'WithdrawalHistoryStatement');
const PortfolioTopUpVerification = lz(() => import('./PortfolioTopUpVerification'), 'PortfolioTopUpVerification');
const PartnershipTopupAuditLog = lz(() => import('./PartnershipTopupAuditLog'), 'PartnershipTopupAuditLog');
const WalletBreakdownReadOnly = lz(() => import('./WalletBreakdownReadOnly'), 'WalletBreakdownReadOnly');
const FinOpsWalletMovePanel = lz(() => import('./FinOpsWalletMovePanel'), 'FinOpsWalletMovePanel');
const EmailTransactionsPanel = lz(() => import('./EmailTransactionsPanel'), 'EmailTransactionsPanel');
const BulkBankPayoutPanel = lz(() => import('./BulkBankPayoutPanel'), 'BulkBankPayoutPanel');
const FundedTenantsList = lz(() => import('./FundedTenantsList'), 'FundedTenantsList');
const AutoCreditReviewPanel = lz(() => import('./AutoCreditReviewPanel'), 'AutoCreditReviewPanel');
const ProxyWithdrawalDiagnosticsPanel = lz(() => import('./ProxyWithdrawalDiagnosticsPanel'), 'ProxyWithdrawalDiagnosticsPanel');
const FloatToWithdrawablePanel = lz(() => import('./FloatToWithdrawablePanel'), 'FloatToWithdrawablePanel');
const MomoSignupSmsTemplatePanel = lz(() => import('./MomoSignupSmsTemplatePanel'), 'MomoSignupSmsTemplatePanel');
const CashDepositCodesPanel = lz(() => import('./CashDepositCodesPanel'), 'CashDepositCodesPanel');
const UserWalletStatementsPanel = lz(() => import('./UserWalletStatementsPanel'), 'UserWalletStatementsPanel');
const WithdrawalNotificationLogPanel = lz(() => import('./WithdrawalNotificationLogPanel'), 'WithdrawalNotificationLogPanel');
const SmsDeliveryLogPanel = lz(() => import('./SmsDeliveryLogPanel'), 'SmsDeliveryLogPanel');
const CashoutSettlementTimeline = lz(() => import('./CashoutSettlementTimeline'), 'CashoutSettlementTimeline');
const MerchantClaimsLog = lz(() => import('./MerchantClaimsLog'), 'MerchantClaimsLog');
const CashoutAgentManager = lz(() => import('@/components/cfo/CashoutAgentManager'), 'CashoutAgentManager');
const MerchantFloatRequestsPanel = lz(() => import('@/components/cfo/MerchantFloatRequestsPanel'), 'MerchantFloatRequestsPanel');
const ReceiptArchivePanel = lz(() => import('@/components/shared/ReceiptArchivePanel'), 'ReceiptArchivePanel');
const DepositBridgeHealthPanel = lz(() => import('@/components/bridge/DepositBridgeHealthPanel'), 'DepositBridgeHealthPanel');
const OpportunitySummaryForm = lz(() => import('@/components/manager/OpportunitySummaryForm'), 'OpportunitySummaryForm');
const AgentRequisitionForm = lz(() => import('./AgentRequisitionForm'), 'AgentRequisitionForm');
const EmployeeRequisitionLinksPanel = lz(() => import('./EmployeeRequisitionLinksPanel'), 'EmployeeRequisitionLinksPanel');
const EmployeeRequisitionQueuePanel = lz(() => import('./EmployeeRequisitionQueuePanel'), 'EmployeeRequisitionQueuePanel');
const FinancialOpsPulseStrip = lz(() => import('./FinancialOpsPulseStrip'), 'FinancialOpsPulseStrip');
import { 
  ShieldCheck, Banknote, ArrowLeft, ChevronDown, ChevronUp,
  ClipboardList, Search, Scale, Shield, Gauge, BookOpen, TrendingUp, FileText,
  WifiOff, MoreHorizontal, AlertTriangle, AlertCircle, ScanLine, Receipt, Mail, Home as HomeIcon,
  ArrowRightLeft, ScrollText, KeyRound, ReceiptText
  , Bell, HandCoins, MessageSquare
  , Store, Archive, Activity, CheckCircle2, Sparkles, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUGX } from '@/lib/rentCalculations';

type View = 'home' | 'deposits' | 'offline_collections';
type Tool =
  | null
  | 'ops' | 'queue' | 'search' | 'recon' | 'ledgers' | 'audit'
  | 'withdrawals' | 'opportunities' | 'requisitions'
  | 'mismatch_metrics' | 'recon_review' | 'withdrawal_history' | 'wallet_breakdown'
  | 'email_tx' | 'funded_tenants' | 'auto_credit_review' | 'proxy_diagnostics'
  | 'topup_audit'
  | 'float_to_withdrawable' | 'momo_sms_template' | 'cash_codes' | 'user_statements'
  | 'withdrawal_notif_log' | 'cashout_settlement' | 'merchant_claims' | 'sms_delivery_log'
  | 'merchant_agents' | 'merchant_float' | 'receipt_archive'
  | 'employee_requisition_links' | 'employee_requisition_queue'
  | 'bridge_health';
// Extend Tool type via union above; add new tools:


/**
 * Items hidden behind the "More" button. Per CFO mandate the dashboard
 * surfaces ONLY the two most-used actions (Verify Deposits, Withdrawals)
 * and tucks the rest in here so the home view stays minimalist.
 */
type MoreAction =
  | { kind: 'tool'; id: Exclude<Tool, null>; label: string; desc: string; icon: typeof Gauge }
  | { kind: 'view'; id: Exclude<View, 'home'>; label: string; desc: string; icon: typeof Gauge };

const moreActions: MoreAction[] = [
  { kind: 'tool', id: 'bridge_health', label: 'Deposit Bridge Health', desc: 'Reliability of the queue between Financial Ops and the wallet ledger — pending, retries, DLQ, gap alerts', icon: Activity },
  { kind: 'tool', id: 'receipt_archive', label: 'Receipt Archive', desc: 'Permanent record of every payout receipt — searchable, one URL per receipt', icon: Archive },
  { kind: 'tool', id: 'merchant_agents', label: 'Merchant Agents', desc: 'Manage cash-out (merchant) agents — same module as the CFO Dashboard', icon: Store },
  { kind: 'tool', id: 'merchant_float', label: 'Merchant Float', desc: 'Fund or reject merchant agent operational float requests', icon: HandCoins },
  { kind: 'tool', id: 'user_statements', label: 'User Wallet Statements', desc: 'Search a user — see withdrawable, float, landlord float & advance statements + full profile', icon: ReceiptText },
  { kind: 'tool', id: 'email_tx', label: 'Email Transactions', desc: 'Live transactions extracted from connected Gmail', icon: Mail },
  { kind: 'tool', id: 'auto_credit_review', label: 'Auto-Credit Review', desc: 'Confirm or reverse best-guess auto-credited deposits', icon: AlertTriangle },
  { kind: 'view', id: 'offline_collections', label: 'Offline Collections', desc: 'Drafts agents submitted with proof', icon: WifiOff },
  { kind: 'tool', id: 'funded_tenants', label: 'Funded Landlords & Tenants', desc: 'Tenants whose landlords have been paid — share to agent on WhatsApp', icon: HomeIcon },
  { kind: 'tool', id: 'withdrawal_history', label: 'Withdrawal History', desc: 'Statement of every withdrawal — balance before & after', icon: Receipt },
  { kind: 'tool', id: 'withdrawal_notif_log', label: 'Withdrawal Notification Log', desc: 'Every merchant withdrawal-alert email — search by recipient, amount & date', icon: Bell },
  { kind: 'tool', id: 'sms_delivery_log', label: 'SMS Delivery Log', desc: 'Delivery-status audit of every claim & payout SMS — provider response, retries & failures', icon: MessageSquare },
  { kind: 'tool', id: 'cashout_settlement', label: 'Cash-Out Settlement Timeline', desc: 'Each withdrawal with the merchant principal reimbursement & 0.5% commission in one ledger trail', icon: ArrowRightLeft },
  { kind: 'tool', id: 'topup_audit', label: 'Top-Up Audit Log', desc: 'Each partnership top-up: fund source, recipient routing & both ledger legs', icon: ScrollText },
  { kind: 'tool', id: 'ledgers', label: 'Ledger', desc: 'Full record of all wallet activity', icon: BookOpen },
  { kind: 'tool', id: 'ops', label: 'Ops Center', desc: 'Automation & monitoring', icon: Gauge },
  { kind: 'tool', id: 'queue', label: 'Approval Queue', desc: 'Pending approvals', icon: ClipboardList },
  { kind: 'tool', id: 'search', label: 'Transaction Search', desc: 'Find any transaction', icon: Search },
  { kind: 'tool', id: 'recon', label: 'Reconciliation', desc: 'Wallet-ledger drift', icon: Scale },
  { kind: 'tool', id: 'recon_review', label: 'Reconciliation Review', desc: 'Match receipts/refs — see what failed and why', icon: ScanLine },
  { kind: 'tool', id: 'audit', label: 'Audit Trail', desc: 'Action history', icon: Shield },
  { kind: 'tool', id: 'opportunities', label: 'Capital Opportunities', desc: 'Investment summaries', icon: TrendingUp },
  { kind: 'tool', id: 'requisitions', label: 'Fund Requisitions', desc: 'Agent fund requests', icon: FileText },
  { kind: 'tool', id: 'employee_requisition_queue', label: 'Employee Requisitions', desc: 'Review pending employee requisitions (public link submissions)', icon: ClipboardList },
  { kind: 'tool', id: 'employee_requisition_links', label: 'Requisition Links', desc: 'Generate & share secure links so employees can submit requisitions without an account', icon: FileText },
  { kind: 'tool', id: 'mismatch_metrics', label: 'Mismatch Metrics', desc: 'Operator provider-mismatch attempts', icon: AlertTriangle },
  { kind: 'tool', id: 'proxy_diagnostics', label: 'Proxy Withdrawal Diagnostics', desc: 'Why each pending proxy withdrawal isn\u2019t auto-settling', icon: AlertCircle },
  { kind: 'tool', id: 'float_to_withdrawable', label: 'Float \u2192 Withdrawable', desc: 'Reclassify a user\u2019s Operational Float into their Withdrawable balance', icon: ArrowRightLeft },
  { kind: 'tool', id: 'momo_sms_template', label: 'MoMo Thank-You SMS', desc: 'Edit the thank-you + signup SMS sent to MTN/Airtel senders', icon: Mail },
];

import { useAuth } from '@/hooks/useAuth';

const WALLET_BREAKDOWN_KEY = 'finops_wallet_breakdown_open';

function getStoredOpen(userId?: string): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    const raw = localStorage.getItem(WALLET_BREAKDOWN_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return !!map[userId];
  } catch {
    return false;
  }
}

function setStoredOpen(userId: string, open: boolean) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const raw = localStorage.getItem(WALLET_BREAKDOWN_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[userId] = open;
    localStorage.setItem(WALLET_BREAKDOWN_KEY, JSON.stringify(map));
  } catch { /* noop */ }
}

export function FinancialOpsCommandCenter({ requirePaymentRef }: { requirePaymentRef?: boolean } = {}) {
  const { user } = useAuth();
  const userId = user?.id;
  const [view, setView] = useState<View>('home');
  const [activeTool, setActiveTool] = useState<Tool>(null);
  const [moreSheet, setMoreSheet] = useState(false);
  const [focusBucket, setFocusBucket] = useState<'float' | 'withdrawable' | null>(null);
  const [walletBreakdownOpen, setWalletBreakdownOpen] = useState(() => getStoredOpen(userId));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('finops_sidebar_collapsed') === '1';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('finops_sidebar_collapsed', sidebarCollapsed ? '1' : '0');
    }
  }, [sidebarCollapsed]);

  const openTool = (t: Tool) => {
    setActiveTool(t);
    setMoreSheet(false);
  };

  // Navigation scroll handling — whenever we switch into a tool or sub-view,
  // reset scroll to the top so the target view (e.g. Merchant Claims) is fully
  // visible and never left behind a floating widget or half-scrolled overlay.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeTool, view]);

  // Persist expand/collapse per user across sessions
  useEffect(() => {
    if (userId) setStoredOpen(userId, walletBreakdownOpen);
  }, [walletBreakdownOpen, userId]);

  const openMoreAction = (a: MoreAction) => {
    if (a.kind === 'tool') {
      openTool(a.id);
    } else {
      setView(a.id);
      setMoreSheet(false);
    }
  };

  // Shared back button — bigger tap target, consistent label & spacing.
  const SubBack = ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors h-10 -ml-2 px-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Financial Ops
    </button>
  );

  // Sub-view: Verify Deposits (unified — user TIDs + field/agent cash)
  let content: JSX.Element;
  if (view === 'deposits') {
    content = (
      <div className="space-y-5">
        <SubBack onClick={() => setView('home')} />
        <Suspense fallback={<PanelFallback />}> <VerifyDepositsHub /> </Suspense>
      </div>
    );
  } else if (view === 'offline_collections') {
    content = (
      <div className="space-y-5">
        <SubBack onClick={() => setView('home')} />
        <Suspense fallback={<PanelFallback />}> <OfflineSubmissionsQueue /> </Suspense>
      </div>
    );
  } else if (activeTool) {
    content = (
      <div className="space-y-5 pb-24 sm:pb-16">
        <SubBack onClick={() => setActiveTool(null)} />
        <Suspense fallback={<PanelFallback />}>
        {activeTool === 'ops' && <ScaleDashboard />}
        {activeTool === 'email_tx' && <EmailTransactionsPanel />}
        {activeTool === 'auto_credit_review' && <AutoCreditReviewPanel />}
        {activeTool === 'queue' && <ApprovalQueue />}
        {activeTool === 'search' && <TransactionSearch />}
        {activeTool === 'recon' && (
          <div className="space-y-6">
            {/* 7-day cash flow context for the operator. */}
            <ReconciliationDashboard />
          </div>
        )}
        {activeTool === 'recon_review' && (
          <ReconciliationReviewScreen
            onCreateNewAllocation={() => setView('deposits')}
          />
        )}
        {activeTool === 'wallet_breakdown' && (
          <div className="space-y-8">
            <FinOpsWalletMovePanel />
            <WalletBreakdownReadOnly />
          </div>
        )}
        {activeTool === 'ledgers' && <LedgerHub />}
        {activeTool === 'audit' && <AuditFeed />}
        {activeTool === 'withdrawals' && (
          <>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2.5">
                <Banknote className="h-6 w-6 text-destructive" />
                Withdrawals & Payouts
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Cash-out requests waiting for a decision.
              </p>
            </div>
            <LandlordPayoutsQueue />
            <EmailPayoutAutoMatchPanel />
            <BulkBankPayoutPanel />
            <FinOpsWithdrawalVerification />
            <PendingWalletOperationsWidget requirePaymentRef={requirePaymentRef} />
            {/* Portfolio top-ups parked at status='awaiting_verification' —
                e.g. partner wallet → portfolio top-ups. Without this panel
                FinOps had no surface to approve them. */}
            <div>
              <h3 className="text-base sm:text-lg font-bold mt-4 mb-2">
                Portfolio Top-Ups Awaiting Verification
              </h3>
              <PortfolioTopUpVerification />
            </div>
          </>
        )}
        {activeTool === 'opportunities' && (
          <OpportunitySummaryForm onClose={() => setActiveTool(null)} />
        )}
        {activeTool === 'requisitions' && (
          <div className="max-w-2xl w-full">
            <AgentRequisitionForm />
          </div>
        )}
        {activeTool === 'employee_requisition_links' && (
          <div className="space-y-2">
            <h2 className="text-lg font-bold">Employee Requisition Links</h2>
            <p className="text-sm text-muted-foreground">
              Share secure links so employees can submit requisitions without a Welile account.
              Every submission is routed straight into your approval queue.
            </p>
            <EmployeeRequisitionLinksPanel />
          </div>
        )}
        {activeTool === 'employee_requisition_queue' && (
          <div className="space-y-2">
            <h2 className="text-lg font-bold">Employee Requisitions</h2>
            <p className="text-sm text-muted-foreground">
              Approve or reject requisitions submitted through your public links.
            </p>
            <EmployeeRequisitionQueuePanel />
          </div>
        )}
        {activeTool === 'mismatch_metrics' && <MismatchMetricsPanel />}
        {activeTool === 'bridge_health' && <DepositBridgeHealthPanel />}
        {activeTool === 'withdrawal_history' && <WithdrawalHistoryStatement />}
        {activeTool === 'funded_tenants' && <FundedTenantsList />}
        {activeTool === 'proxy_diagnostics' && <ProxyWithdrawalDiagnosticsPanel />}
        {activeTool === 'float_to_withdrawable' && <FloatToWithdrawablePanel />}
        {activeTool === 'topup_audit' && <PartnershipTopupAuditLog />}
        {activeTool === 'momo_sms_template' && <MomoSignupSmsTemplatePanel />}
        {activeTool === 'cash_codes' && <CashDepositCodesPanel />}
        {activeTool === 'user_statements' && <UserWalletStatementsPanel />}
        {activeTool === 'withdrawal_notif_log' && <WithdrawalNotificationLogPanel />}
        {activeTool === 'sms_delivery_log' && <SmsDeliveryLogPanel />}
        {activeTool === 'cashout_settlement' && <CashoutSettlementTimeline />}
        {activeTool === 'merchant_claims' && <MerchantClaimsLog />}
        {activeTool === 'merchant_agents' && <CashoutAgentManager />}
        {activeTool === 'receipt_archive' && <ReceiptArchivePanel />}
        {activeTool === 'merchant_float' && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold">🏪 Merchant Float Requests</h1>
              <p className="text-sm text-muted-foreground">
                Cash-out merchant agents requesting operational float top-ups. Fund their Float
                bucket via the Agent Float Allocation category or reject with a reason.
              </p>
            </div>
            <MerchantFloatRequestsPanel />
          </div>
        )}
        </Suspense>
      </div>
    );
  } else {
    content = (
      <FinOpsHome
        onView={setView}
        onOpenTool={openTool}
        onOpenMore={() => setMoreSheet(true)}
        onFocusBucket={setFocusBucket}
        walletBreakdownOpen={walletBreakdownOpen}
        setWalletBreakdownOpen={(v) => {
          setWalletBreakdownOpen(v);
          if (userId) setStoredOpen(userId, v);
        }}
        focusBucket={focusBucket}
        onClearFocus={() => setFocusBucket(null)}
        moreSheet={moreSheet}
        setMoreSheet={setMoreSheet}
        openMoreAction={openMoreAction}
      />
    );
  }

  const activeId: string | null = activeTool ?? (view !== 'home' ? view : null);

  // Group the tool list into meaningful sections for the sidebar.
  const sidebarGroups: { title: string; items: MoreAction[] }[] = [
    {
      title: 'Deposits & Reconciliation',
      items: moreActions.filter(a => [
        'bridge_health','email_tx','auto_credit_review','offline_collections',
        'recon','recon_review','mismatch_metrics',
      ].includes(a.id as string)),
    },
    {
      title: 'Withdrawals & Payouts',
      items: moreActions.filter(a => [
        'withdrawal_history','withdrawal_notif_log','cashout_settlement',
        'proxy_diagnostics','receipt_archive',
      ].includes(a.id as string)),
    },
    {
      title: 'Merchant Network',
      items: moreActions.filter(a => [
        'merchant_agents','merchant_float',
      ].includes(a.id as string)),
    },
    {
      title: 'Wallets & Users',
      items: moreActions.filter(a => [
        'user_statements','funded_tenants','float_to_withdrawable',
        'momo_sms_template',
      ].includes(a.id as string)),
    },
    {
      title: 'Ledger & Audit',
      items: moreActions.filter(a => [
        'ledgers','audit','topup_audit','sms_delivery_log',
      ].includes(a.id as string)),
    },
    {
      title: 'Ops & Requisitions',
      items: moreActions.filter(a => [
        'ops','queue','search','opportunities','requisitions',
        'employee_requisition_queue','employee_requisition_links',
      ].includes(a.id as string)),
    },
  ];
  const [sidebarQuery, setSidebarQuery] = useState('');
  const q = sidebarQuery.trim().toLowerCase();
  const filteredGroups = q
    ? sidebarGroups
        .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)) }))
        .filter(g => g.items.length > 0)
    : sidebarGroups;

  return (
    <div className="flex gap-6 items-start min-w-0">
      {/* Persistent sidebar (desktop) */}
      <aside className={`hidden lg:flex ${sidebarCollapsed ? 'w-14' : 'w-64 xl:w-72'} shrink-0 sticky top-4 self-start h-[calc(100vh-2rem)] flex-col rounded-2xl border border-border bg-card overflow-hidden transition-[width] duration-200`}>
        {/* Sidebar header */}
        <div className={`${sidebarCollapsed ? 'px-2 py-3' : 'px-4 pt-4 pb-3'} border-b border-border bg-gradient-to-br from-primary/5 via-card to-card`}>
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} gap-2`}>
            <div className={`flex items-center gap-2 min-w-0 ${sidebarCollapsed ? 'hidden' : ''}`}>
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground leading-none">Financial Ops</p>
                <p className="text-sm font-semibold text-foreground mt-1 leading-none">Command Center</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
          {/* Search — hidden when collapsed */}
          {!sidebarCollapsed && (
            <div className="mt-3 relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={sidebarQuery}
                onChange={(e) => setSidebarQuery(e.target.value)}
                placeholder="Search tools…"
                className="w-full h-8 pl-8 pr-2.5 rounded-md bg-background border border-border text-xs placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40"
              />
            </div>
          )}
        </div>

        {/* Home shortcut */}
        <div className={`${sidebarCollapsed ? 'px-1.5' : 'px-2'} pt-2`}>
          <button
            onClick={() => { setActiveTool(null); setView('home'); }}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-2.5'} py-2 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeId === null
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted/60'
            }`}
            title="Overview"
          >
            <HomeIcon className={`h-4 w-4 shrink-0 ${activeId === null ? 'text-primary' : 'text-muted-foreground'}`} />
            {!sidebarCollapsed && <span className="text-[13px] font-semibold">Overview</span>}
          </button>
        </div>

        {/* Grouped navigation */}
        <nav className={`flex-1 overflow-y-auto ${sidebarCollapsed ? 'px-1.5' : 'px-2'} pb-3 pt-1 scrollbar-thin`}>
          {!sidebarCollapsed && filteredGroups.length === 0 && (
            <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
              No tools match "{sidebarQuery}"
            </p>
          )}
          {(sidebarCollapsed ? sidebarGroups : filteredGroups).map((group, gi) => (
            <div key={group.title} className={`mt-3 first:mt-2 ${sidebarCollapsed && gi > 0 ? 'pt-2 border-t border-border/60' : ''}`}>
              {!sidebarCollapsed && (
                <p className="px-2.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                  {group.title}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((a) => {
                  const isActive = activeId === a.id;
                  return (
                    <button
                      key={`${a.kind}-${a.id}`}
                      onClick={() => openMoreAction(a)}
                      className={`group w-full flex items-center ${sidebarCollapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-1.5'} rounded-md text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary relative ${
                        isActive
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'text-foreground/85 hover:bg-muted/60 hover:text-foreground'
                      }`}
                      title={sidebarCollapsed ? a.label : a.desc}
                    >
                      {isActive && !sidebarCollapsed && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-primary" />
                      )}
                      <a.icon className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                      }`} />
                      {!sidebarCollapsed && (
                        <span className="text-[13px] leading-tight truncate">{a.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer status pill */}
        <div className={`border-t border-border ${sidebarCollapsed ? 'px-2 py-2 flex justify-center' : 'px-3 py-2.5'} bg-muted/20`}>
          <div className={`flex items-center gap-2 text-[11px] text-muted-foreground ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            {!sidebarCollapsed && <span className="font-medium">Live · syncing ledger</span>}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {content}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Precision FinOps — professional home view
// ═══════════════════════════════════════════════════════════════════

interface FinOpsHomeProps {
  onView: (v: View) => void;
  onOpenTool: (t: Tool) => void;
  onOpenMore: () => void;
  onFocusBucket: (b: 'float' | 'withdrawable' | null) => void;
  walletBreakdownOpen: boolean;
  setWalletBreakdownOpen: (v: boolean) => void;
  focusBucket: 'float' | 'withdrawable' | null;
  onClearFocus: () => void;
  moreSheet: boolean;
  setMoreSheet: (v: boolean) => void;
  openMoreAction: (a: MoreAction) => void;
}

function FinOpsHome({
  onView, onOpenTool, onOpenMore, onFocusBucket,
  walletBreakdownOpen, setWalletBreakdownOpen, focusBucket, onClearFocus,
  moreSheet, setMoreSheet, openMoreAction,
}: FinOpsHomeProps) {
  const qc = useQueryClient();

  const { data: totals, isLoading: totalsLoading } = useQuery({
    queryKey: ['finops-wallet-overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_wallet_totals');
      if (error) throw error;
      const d = data as any;
      return {
        totalBalance: Number(d.total_balance ?? 0),
        walletCount: Number(d.total_wallets ?? 0),
        activeWallets: Number(d.active_wallets ?? 0),
        totalFloat: Number(d.total_float ?? 0),
        totalWithdrawable: Number(d.total_withdrawable ?? 0),
      };
    },
    staleTime: 60_000,
  });

  const { data: strict } = useQuery({
    queryKey: ['finops-wallet-overview-strict'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_wallet_totals_strict');
      if (error) throw error;
      const d = data as any;
      return {
        strictTotal: Number(d?.strict_total ?? 0),
        driftedWallets: Number(d?.drifted_wallets ?? 0),
        totalDrift: Number(d?.total_drift ?? 0),
      };
    },
    staleTime: 60_000,
  });

  const { data: queues } = useQuery({
    queryKey: ['finops-wallet-overview-queues'],
    queryFn: async () => {
      const userDeposits = await supabase
        .from('deposit_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      const fieldDeposits = await supabase
        .from('field_deposit_batches')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_finops_verification');
      const withdrawals = await supabase
        .from('withdrawal_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      const claims = await supabase
        .from('withdrawal_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['claimed', 'processing']);
      return {
        depositsPending: (userDeposits.count ?? 0) + (fieldDeposits.count ?? 0),
        payoutsPending: withdrawals.count ?? 0,
        activeClaims: claims.count ?? 0,
      };
    },
    staleTime: 15_000,
  });

  const driftMaterial = (strict?.totalDrift ?? 0) > 100 || (strict?.driftedWallets ?? 0) > 0;

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['finops-wallet-overview'] });
    qc.invalidateQueries({ queryKey: ['finops-wallet-overview-strict'] });
    qc.invalidateQueries({ queryKey: ['finops-wallet-overview-queues'] });
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Financial Operations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verify deposits, approve withdrawals and keep the platform balanced.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Live
          </span>
          <button
            onClick={refreshAll}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Hero + Ledger Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 min-w-0">
          <WalletOverviewCard
            onOpenReconciliation={() => onOpenTool('recon')}
            onOpenBreakdown={() => onOpenTool('wallet_breakdown')}
            onDrillBucket={(bucket) => onFocusBucket(bucket)}
          />
        </div>
        <button
          onClick={() => onOpenTool('recon')}
          className="text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all min-w-0 flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ledger Health</p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              driftMaterial
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                : 'bg-primary/10 text-primary'
            }`}>
              {driftMaterial ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {driftMaterial ? 'Drift' : 'Reconciled'}
            </span>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>Last verified moments ago</span>
          </div>
          <div className="flex-1" />
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Ledger total</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground break-all">
              {formatUGX(strict?.strictTotal ?? 0)}
            </p>
            {driftMaterial && (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                {strict?.driftedWallets ?? 0} wallet(s) drifted · {formatUGX(strict?.totalDrift ?? 0)}
              </p>
            )}
          </div>
        </button>
      </div>

      {/* Flagship action tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ActionStatTile
          onClick={() => onView('deposits')}
          icon={ShieldCheck}
          tone="primary"
          count={queues?.depositsPending ?? 0}
          countLabel="Pending Verification"
          title="Verify Deposits"
          desc="User top-ups & agent field cash — one place."
        />
        <ActionStatTile
          onClick={() => onOpenTool('withdrawals')}
          icon={Banknote}
          tone="secondary"
          count={queues?.payoutsPending ?? 0}
          countLabel="Payout Requests"
          title="Withdrawal Approvals"
          desc="Review and release user withdrawable funds."
        />
        <ActionStatTile
          onClick={() => onOpenTool('merchant_claims')}
          icon={HandCoins}
          tone="tertiary"
          count={queues?.activeClaims ?? 0}
          countLabel="Active Claims"
          title="Merchant Claims"
          desc="Operational settlements for cash-out agents."
        />
      </div>

      {/* Wallet Breakdown */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setWalletBreakdownOpen(!walletBreakdownOpen)}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold tracking-tight">Wallet Breakdown</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Search every wallet by name, phone, or balance range.
            </p>
          </div>
          {walletBreakdownOpen ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
          )}
        </button>
        {walletBreakdownOpen && (
          <div className="px-4 pb-4 border-t border-border">
            <WalletBreakdownReadOnly
              focusBucket={focusBucket}
              onClearFocus={onClearFocus}
            />
          </div>
        )}
      </div>

      {/* Pulse strip — dense KPI row (kept for operators) */}
      <FinancialOpsPulseStrip
        onSelect={(key) => {
          switch (key) {
            case 'deposits': onView('deposits'); break;
            case 'cash_out':
            case 'wallet_ops':
            case 'invest_wd': onOpenTool('withdrawals'); break;
            case 'today': onOpenTool('audit'); break;
          }
        }}
      />

      {/* Quick-access footer row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border">
        <QuickTile icon={Activity} label="Bridge Health" desc="API connectivity status." onClick={() => onOpenTool('bridge_health')} />
        <QuickTile icon={Archive} label="Receipt Archive" desc="Every payout receipt." onClick={() => onOpenTool('receipt_archive')} />
        <QuickTile icon={ArrowRightLeft} label="Cash-Out Timeline" desc="Agent settlement flow." onClick={() => onOpenTool('cashout_settlement')} />
        <QuickTile icon={MoreHorizontal} label="Explore Tools" desc="Audit & review logs." onClick={onOpenMore} />
      </div>

      {/* Cash Deposit Codes — time-sensitive quick action */}
      <button
        onClick={() => onOpenTool('cash_codes')}
        className="w-full flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/50 transition-all p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
          <KeyRound className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Cash Deposit Codes</p>
          <p className="text-xs text-muted-foreground">Read pending codes back to depositors — codes expire in 2 min.</p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground rotate-[-90deg]" />
      </button>

      {/* "More" Sheet */}
      <Sheet open={moreSheet} onOpenChange={setMoreSheet}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md p-0 flex flex-col overflow-hidden"
        >
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
            <SheetTitle>Explore Tools</SheetTitle>
            <SheetDescription>Everything beyond verifying deposits and approving withdrawals</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 min-w-0">
            {moreActions.map(a => (
              <button
                key={`${a.kind}-${a.id}`}
                onClick={() => openMoreAction(a)}
                className="w-full max-w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-colors text-left overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <a.icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm block break-words">{a.label}</span>
                  <span className="text-[11px] text-muted-foreground block break-words">{a.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ActionStatTile({
  onClick, icon: Icon, tone, count, countLabel, title, desc,
}: {
  onClick: () => void;
  icon: typeof ShieldCheck;
  tone: 'primary' | 'secondary' | 'tertiary';
  count: number;
  countLabel: string;
  title: string;
  desc: string;
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : tone === 'secondary'
      ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
      : 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400';
  return (
    <button
      onClick={onClick}
      className="group relative text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all min-h-[168px] flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-right">
          <p className="text-3xl sm:text-4xl font-black tabular-nums leading-none text-foreground">
            {count.toLocaleString()}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {countLabel}
          </p>
        </div>
      </div>
      <div className="flex-1" />
      <div className="mt-4">
        <p className="font-bold text-base tracking-tight">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </button>
  );
}

function QuickTile({
  icon: Icon, label, desc, onClick,
}: {
  icon: typeof Activity;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:bg-primary/5 transition-all min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{label}</p>
          <p className="text-[11px] text-muted-foreground truncate">{desc}</p>
        </div>
      </div>
    </button>
  );
}

