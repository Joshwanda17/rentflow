import { useEffect, useState } from 'react';
import { FinancialOpsPulseStrip } from './FinancialOpsPulseStrip';
import { ApprovalQueue } from './ApprovalQueue';
import { TransactionSearch } from './TransactionSearch';
import { ReconciliationDashboard } from './ReconciliationDashboard';
import { AuditFeed } from './AuditFeed';
import { ScaleDashboard } from './ScaleDashboard';
import { FinOpsWithdrawalVerification } from './FinOpsWithdrawalVerification';
import { EmailPayoutAutoMatchPanel } from './EmailPayoutAutoMatchPanel';
import { LandlordPayoutsQueue } from './LandlordPayoutsQueue';
import { LedgerHub } from '@/components/ledgers/LedgerHub';
import { PendingWalletOperationsWidget } from '@/components/manager/PendingWalletOperationsWidget';
import { WalletOverviewCard } from './WalletOverviewCard';
import { OfflineSubmissionsQueue } from './OfflineSubmissionsQueue';
import { VerifyDepositsHub } from './VerifyDepositsHub';
import { MismatchMetricsPanel } from './MismatchMetricsPanel';
import { ReconciliationReviewScreen } from './ReconciliationReviewScreen';
import { WithdrawalHistoryStatement } from './WithdrawalHistoryStatement';
import { PortfolioTopUpVerification } from './PortfolioTopUpVerification';
import { PartnershipTopupAuditLog } from './PartnershipTopupAuditLog';
import { WalletBreakdownReadOnly } from './WalletBreakdownReadOnly';
import { FinOpsWalletMovePanel } from './FinOpsWalletMovePanel';
import { EmailTransactionsPanel } from './EmailTransactionsPanel';
import { BulkBankPayoutPanel } from './BulkBankPayoutPanel';
import { FundedTenantsList } from './FundedTenantsList';
import { AutoCreditReviewPanel } from './AutoCreditReviewPanel';
import { ProxyWithdrawalDiagnosticsPanel } from './ProxyWithdrawalDiagnosticsPanel';
import { FloatToWithdrawablePanel } from './FloatToWithdrawablePanel';
import { MomoSignupSmsTemplatePanel } from './MomoSignupSmsTemplatePanel';
import { CashDepositCodesPanel } from './CashDepositCodesPanel';
import { UserWalletStatementsPanel } from './UserWalletStatementsPanel';
import { WithdrawalNotificationLogPanel } from './WithdrawalNotificationLogPanel';
import { SmsDeliveryLogPanel } from './SmsDeliveryLogPanel';
import { CashoutSettlementTimeline } from './CashoutSettlementTimeline';
import { MerchantClaimsLog } from './MerchantClaimsLog';
import { CashoutAgentManager } from '@/components/cfo/CashoutAgentManager';
import { MerchantFloatRequestsPanel } from '@/components/cfo/MerchantFloatRequestsPanel';
import { ReceiptArchivePanel } from '@/components/shared/ReceiptArchivePanel';


import { OpportunitySummaryForm } from '@/components/manager/OpportunitySummaryForm';
import { AgentRequisitionForm } from './AgentRequisitionForm';
import { 
  ShieldCheck, Banknote, ArrowLeft, ChevronDown, ChevronUp,
  ClipboardList, Search, Scale, Shield, Gauge, BookOpen, TrendingUp, FileText,
  WifiOff, MoreHorizontal, AlertTriangle, AlertCircle, ScanLine, Receipt, Mail, Home as HomeIcon,
  ArrowRightLeft, ScrollText, KeyRound, ReceiptText
  , Bell, HandCoins, MessageSquare
  , Store, Archive
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

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
  | 'merchant_agents' | 'merchant_float' | 'receipt_archive';


/**
 * Items hidden behind the "More" button. Per CFO mandate the dashboard
 * surfaces ONLY the two most-used actions (Verify Deposits, Withdrawals)
 * and tucks the rest in here so the home view stays minimalist.
 */
type MoreAction =
  | { kind: 'tool'; id: Exclude<Tool, null>; label: string; desc: string; icon: typeof Gauge }
  | { kind: 'view'; id: Exclude<View, 'home'>; label: string; desc: string; icon: typeof Gauge };

const moreActions: MoreAction[] = [
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
  if (view === 'deposits') {
    return (
      <div className="space-y-5">
        <SubBack onClick={() => setView('home')} />
        <VerifyDepositsHub />
      </div>
    );
  }

  // Sub-view: Offline Collections (agent IndexedDB drafts submitted with proof)
  if (view === 'offline_collections') {
    return (
      <div className="space-y-5">
        <SubBack onClick={() => setView('home')} />
        <OfflineSubmissionsQueue />
      </div>
    );
  }


  // Sub-view: Active tool
  if (activeTool) {
    return (
      <div className="space-y-5 pb-24 sm:pb-16">
        <SubBack onClick={() => setActiveTool(null)} />
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
        {activeTool === 'mismatch_metrics' && <MismatchMetricsPanel />}
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
      </div>
    );
  }

  // Home: Core tools front and center
  return (
    <div className="space-y-6">
      {/* Page header — bigger title so the operator immediately knows where
          they are without parsing. */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Financial Ops
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verify deposits, approve withdrawals and keep the platform balanced.
        </p>
      </div>

      <WalletOverviewCard
        onOpenReconciliation={() => openTool('recon')}
        onOpenBreakdown={() => openTool('wallet_breakdown')}
        onDrillBucket={(bucket) => setFocusBucket(bucket)}
      />

      {/* Drilldown table: every user's Operations Float and Withdrawable */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => {
            const next = !walletBreakdownOpen;
            setWalletBreakdownOpen(next);
            if (userId) setStoredOpen(userId, next);
          }}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold">Wallet Breakdown</h2>
              {walletBreakdownOpen && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setWalletBreakdownOpen(false);
                    if (userId) setStoredOpen(userId, false);
                  }}
                  className="text-[10px] font-medium text-muted-foreground hover:text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded px-1"
                >
                  Reset to collapsed
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {walletBreakdownOpen ? 'Tap to collapse' : 'Tap to expand — every user\'s Float and Withdrawable'}
            </p>
          </div>
          {walletBreakdownOpen ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
          )}
        </button>
        {walletBreakdownOpen && (
          <div className="px-4 pb-4">
            <WalletBreakdownReadOnly
              focusBucket={focusBucket}
              onClearFocus={() => setFocusBucket(null)}
            />
          </div>
        )}
      </div>
      <FinancialOpsPulseStrip
        onSelect={(key) => {
          switch (key) {
            case 'deposits':
              setView('deposits');
              break;
            case 'cash_out':
            case 'wallet_ops':
            case 'invest_wd':
              openTool('withdrawals');
              break;
            case 'today':
              openTool('audit');
              break;
          }
        }}
      />

      {/* ═══ CORE: Wallet Management ═══
          Per CFO mandate: only the two most-used actions live here.
          Verify Deposits is the single front door for ALL incoming money
          (user TIDs + agent field cash batches). Withdrawals & Payouts
          handles every outgoing approval/rejection. Anything else is
          one tap away in "More". */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">
          What do you want to do?
        </h2>
        {/* relative z-10 keeps these tap targets above decorative floating
            widgets (share/WhatsApp bubbles). Bottom padding guarantees the last
            button (More) is never covered by a fixed bottom-anchored element. */}
        <div className="grid grid-cols-1 gap-3 min-w-0 relative z-10 pb-24 sm:pb-16">
          {/* 1. Verify ALL Deposits (user TIDs + field/agent cash → float) */}
          <button
            onClick={() => setView('deposits')}
            className="w-full max-w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-left min-h-[88px] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base sm:text-lg break-words">Verify Deposits</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 break-words">
                User top-ups & agent field cash — one place
              </p>
            </div>
          </button>

          {/* 2. Approve or Reject Withdrawals */}
          <button
            onClick={() => openTool('withdrawals')}
            className="w-full max-w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl border-2 border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 hover:border-orange-500/50 transition-all text-left min-h-[88px] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
              <Banknote className="h-6 w-6 sm:h-7 sm:w-7 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base sm:text-lg break-words">Approve or Reject Withdrawals</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 break-words">
                Cash-out requests waiting for a decision
              </p>
            </div>
          </button>

          {/* 3. Cash Deposit Codes — time-sensitive (codes expire in 2 min) */}
          <button
            onClick={() => openTool('cash_codes')}
            className="w-full max-w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl border-2 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/50 transition-all text-left min-h-[88px] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
              <KeyRound className="h-6 w-6 sm:h-7 sm:w-7 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base sm:text-lg break-words">Cash Deposit Codes</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 break-words">
                Read pending codes back to depositors — no email needed
              </p>
            </div>
          </button>

          {/* 4. Merchant Claims — quick access to cash-out agent claim activity */}
          <button
            onClick={() => openTool('merchant_claims')}
            className="w-full max-w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all text-left min-h-[88px] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <HandCoins className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base sm:text-lg break-words">Merchant Claims</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 break-words">
                Every withdrawal claimed by a cash-out agent — in-progress & completed
              </p>
            </div>
          </button>

          {/* 5. More — everything else */}
          <button
            onClick={() => setMoreSheet(true)}
            className="w-full max-w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl border border-border bg-card hover:bg-accent/40 transition-all text-left min-h-[88px] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <MoreHorizontal className="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base sm:text-lg break-words">More</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 break-words">
                Offline collections, ledger, deductions & support tools
              </p>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
          </button>
        </div>
      </div>

      {/* "More" Sheet — every secondary tool lives here */}
      <Sheet open={moreSheet} onOpenChange={setMoreSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-hidden w-full max-w-full">
          <SheetHeader>
            <SheetTitle>More tools</SheetTitle>
            <SheetDescription>Everything beyond verifying deposits and approving withdrawals</SheetDescription>
          </SheetHeader>
          <div className="grid gap-1.5 mt-4 overflow-y-auto overflow-x-hidden pb-4 min-w-0">
            {moreActions.map(a => (
              <button
                key={`${a.kind}-${a.id}`}
                onClick={() => openMoreAction(a)}
                className="w-full max-w-full flex items-center gap-3 p-3 sm:p-4 rounded-xl hover:bg-accent/40 transition-colors text-left overflow-hidden"
              >
                <a.icon className="h-5 w-5 text-muted-foreground shrink-0" />
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
