import { useState } from 'react';
import { FinancialOpsPulseStrip } from './FinancialOpsPulseStrip';
import { ApprovalQueue } from './ApprovalQueue';
import { TransactionSearch } from './TransactionSearch';
import { ReconciliationDashboard } from './ReconciliationDashboard';
import { AuditFeed } from './AuditFeed';
import { ScaleDashboard } from './ScaleDashboard';
import { FloatPayoutVerification } from './FloatPayoutVerification';
import { FinOpsWithdrawalVerification } from './FinOpsWithdrawalVerification';
import { LandlordPayoutsQueue } from './LandlordPayoutsQueue';
import { LedgerHub } from '@/components/ledgers/LedgerHub';
import { PendingWalletOperationsWidget } from '@/components/manager/PendingWalletOperationsWidget';
import { WalletOverviewCard } from './WalletOverviewCard';
import { OfflineSubmissionsQueue } from './OfflineSubmissionsQueue';
import { VerifyDepositsHub } from './VerifyDepositsHub';
import { MismatchMetricsPanel } from './MismatchMetricsPanel';
import { ReconciliationReviewScreen } from './ReconciliationReviewScreen';
import { WithdrawalHistoryStatement } from './WithdrawalHistoryStatement';


import { OpportunitySummaryForm } from '@/components/manager/OpportunitySummaryForm';
import { AgentRequisitionForm } from './AgentRequisitionForm';
import { 
  ShieldCheck, Banknote, ArrowLeft, ChevronDown,
  ClipboardList, Search, Scale, Shield, Gauge, BookOpen, TrendingUp, FileText,
  WifiOff, MoreHorizontal, AlertTriangle, ScanLine, Receipt
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

type View = 'home' | 'deposits' | 'offline_collections';
type Tool =
  | null
  | 'ops' | 'queue' | 'search' | 'recon' | 'ledgers' | 'audit'
  | 'withdrawals' | 'opportunities' | 'requisitions'
  | 'mismatch_metrics' | 'recon_review' | 'withdrawal_history';

/**
 * Items hidden behind the "More" button. Per CFO mandate the dashboard
 * surfaces ONLY the two most-used actions (Verify Deposits, Withdrawals)
 * and tucks the rest in here so the home view stays minimalist.
 */
type MoreAction =
  | { kind: 'tool'; id: Exclude<Tool, null>; label: string; desc: string; icon: typeof Gauge }
  | { kind: 'view'; id: Exclude<View, 'home'>; label: string; desc: string; icon: typeof Gauge };

const moreActions: MoreAction[] = [
  { kind: 'view', id: 'offline_collections', label: 'Offline Collections', desc: 'Drafts agents submitted with proof', icon: WifiOff },
  { kind: 'tool', id: 'withdrawal_history', label: 'Withdrawal History', desc: 'Statement of every withdrawal — balance before & after', icon: Receipt },
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
];

export function FinancialOpsCommandCenter({ requirePaymentRef }: { requirePaymentRef?: boolean } = {}) {
  const [view, setView] = useState<View>('home');
  const [activeTool, setActiveTool] = useState<Tool>(null);
  const [moreSheet, setMoreSheet] = useState(false);

  const openTool = (t: Tool) => {
    setActiveTool(t);
    setMoreSheet(false);
  };

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
      <div className="space-y-5">
        <SubBack onClick={() => setActiveTool(null)} />
        {activeTool === 'ops' && <ScaleDashboard />}
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
            <FinOpsWithdrawalVerification />
            <PendingWalletOperationsWidget requirePaymentRef={requirePaymentRef} />
            <FloatPayoutVerification />
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
      />
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
        <div className="grid grid-cols-1 gap-3">
          {/* 1. Verify ALL Deposits (user TIDs + field/agent cash → float) */}
          <button
            onClick={() => setView('deposits')}
            className="flex items-center gap-4 p-5 sm:p-6 rounded-2xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-left min-h-[88px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="h-14 w-14 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base sm:text-lg">Verify Deposits</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                User top-ups & agent field cash — one place
              </p>
            </div>
          </button>

          {/* 2. Approve or Reject Withdrawals */}
          <button
            onClick={() => openTool('withdrawals')}
            className="flex items-center gap-4 p-5 sm:p-6 rounded-2xl border-2 border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 hover:border-orange-500/50 transition-all text-left min-h-[88px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="h-14 w-14 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
              <Banknote className="h-7 w-7 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base sm:text-lg">Approve or Reject Withdrawals</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Cash-out requests waiting for a decision
              </p>
            </div>
          </button>

          {/* 3. More — everything else */}
          <button
            onClick={() => setMoreSheet(true)}
            className="flex items-center gap-4 p-5 sm:p-6 rounded-2xl border border-border bg-card hover:bg-accent/40 transition-all text-left min-h-[88px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <MoreHorizontal className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base sm:text-lg">More</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Offline collections, ledger, deductions & support tools
              </p>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
          </button>
        </div>
      </div>

      {/* "More" Sheet — every secondary tool lives here */}
      <Sheet open={moreSheet} onOpenChange={setMoreSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
          <SheetHeader>
            <SheetTitle>More tools</SheetTitle>
            <SheetDescription>Everything beyond verifying deposits and approving withdrawals</SheetDescription>
          </SheetHeader>
          <div className="grid gap-1.5 mt-4 overflow-y-auto pb-4">
            {moreActions.map(a => (
              <button
                key={`${a.kind}-${a.id}`}
                onClick={() => openMoreAction(a)}
                className="flex items-center gap-3 p-4 rounded-xl hover:bg-accent/40 transition-colors text-left"
              >
                <a.icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm block">{a.label}</span>
                  <span className="text-[11px] text-muted-foreground">{a.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
