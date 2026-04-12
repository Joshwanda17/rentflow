import { useState } from 'react';
import { FinancialOpsPulseStrip } from './FinancialOpsPulseStrip';
import { ApprovalQueue } from './ApprovalQueue';
import { TransactionSearch } from './TransactionSearch';
import { ReconciliationDashboard } from './ReconciliationDashboard';
import { AuditFeed } from './AuditFeed';
import { TidVerification } from './TidVerification';
import { ScaleDashboard } from './ScaleDashboard';
import { FloatPayoutVerification } from './FloatPayoutVerification';
import { FinOpsWithdrawalVerification } from './FinOpsWithdrawalVerification';
import { WalletDeductionPanel } from './WalletDeductionPanel';
import { LedgerHub } from '@/components/ledgers/LedgerHub';
import { PendingWalletOperationsWidget } from '@/components/manager/PendingWalletOperationsWidget';
import { DepositStatsPanel } from './DepositStatsPanel';
import { WalletOverviewCard } from './WalletOverviewCard';
import { OpportunitySummaryForm } from '@/components/manager/OpportunitySummaryForm';
import { AgentRequisitionForm } from './AgentRequisitionForm';
import { 
  ShieldCheck, Banknote, ArrowLeft, ChevronDown, ChevronUp,
  ClipboardList, Search, Scale, Shield, Gauge, BookOpen, TrendingUp, MinusCircle, FileText
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AnimatePresence } from 'framer-motion';

type View = 'home' | 'deposits';
type Tool = null | 'ops' | 'queue' | 'search' | 'recon' | 'ledgers' | 'audit' | 'withdrawals' | 'opportunities' | 'deductions' | 'requisitions';

const supportTools = [
  { id: 'ops' as const, label: 'Ops Center', icon: Gauge, desc: 'Automation & monitoring' },
  { id: 'queue' as const, label: 'Approval Queue', icon: ClipboardList, desc: 'Pending approvals' },
  { id: 'search' as const, label: 'Transaction Search', icon: Search, desc: 'Find any transaction' },
  { id: 'recon' as const, label: 'Reconciliation', icon: Scale, desc: 'Wallet-ledger drift' },
  { id: 'audit' as const, label: 'Audit Trail', icon: Shield, desc: 'Action history' },
  { id: 'opportunities' as const, label: 'Capital Opportunities', icon: TrendingUp, desc: 'Investment summaries' },
  { id: 'requisitions' as const, label: 'Fund Requisitions', icon: FileText, desc: 'Agent fund requests' },
];

export function FinancialOpsCommandCenter({ requirePaymentRef }: { requirePaymentRef?: boolean } = {}) {
  const [view, setView] = useState<View>('home');
  const [activeTool, setActiveTool] = useState<Tool>(null);
  const [showDepositStats, setShowDepositStats] = useState(false);
  const [supportSheet, setSupportSheet] = useState(false);

  const openTool = (t: Tool) => {
    setActiveTool(t);
    setSupportSheet(false);
  };

  // Sub-view: Deposits
  if (view === 'deposits') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('home')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Verify User Deposits
        </h2>
        <p className="text-xs text-muted-foreground -mt-2">
          CFO credits from <span className="font-semibold text-foreground">Welile Technologies Finance</span> are auto-approved and do not require verification.
        </p>
        <TidVerification />
      </div>
    );
  }

  // Sub-view: Active tool
  if (activeTool) {
    return (
      <div className="space-y-4">
        <button onClick={() => setActiveTool(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {activeTool === 'ops' && <ScaleDashboard />}
        {activeTool === 'queue' && <ApprovalQueue />}
        {activeTool === 'search' && <TransactionSearch />}
        {activeTool === 'recon' && <ReconciliationDashboard />}
        {activeTool === 'ledgers' && <LedgerHub />}
        {activeTool === 'audit' && <AuditFeed />}
        {activeTool === 'withdrawals' && (
          <>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Banknote className="h-5 w-5 text-destructive" />
              Withdrawals & Payouts
            </h2>
            <FinOpsWithdrawalVerification />
            <PendingWalletOperationsWidget requirePaymentRef={requirePaymentRef} />
            <FloatPayoutVerification />
          </>
        )}
        {activeTool === 'opportunities' && (
          <OpportunitySummaryForm onClose={() => setActiveTool(null)} />
        )}
        {activeTool === 'deductions' && (
          <div className="max-w-2xl w-full">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <MinusCircle className="h-5 w-5 text-orange-600" />
              Wallet Deductions
            </h2>
            <WalletDeductionPanel />
          </div>
        )}
        {activeTool === 'requisitions' && (
          <div className="max-w-2xl w-full">
            <AgentRequisitionForm />
          </div>
        )}
      </div>
    );
  }

  // Home: Core tools front and center
  return (
    <div className="space-y-5">
      <WalletOverviewCard />
      <FinancialOpsPulseStrip />

      {/* ═══ CORE: Wallet Management ═══ */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Wallet Management
        </h2>
        <div className="grid grid-cols-1 gap-3">
          {/* Verify User Deposits */}
          <button
            onClick={() => setShowDepositStats(!showDepositStats)}
            className="flex items-center gap-4 p-5 rounded-2xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-left min-h-[80px]"
          >
            <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-base">Verify Deposits</p>
              <p className="text-xs text-muted-foreground">TID match & approve user deposits</p>
            </div>
            {showDepositStats ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
          </button>

          <AnimatePresence>
            {showDepositStats && (
              <DepositStatsPanel onOpenVerification={() => setView('deposits')} />
            )}
          </AnimatePresence>

          {/* Withdrawals & Payouts */}
          <button
            onClick={() => openTool('withdrawals')}
            className="flex items-center gap-4 p-5 rounded-2xl border-2 border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 hover:border-orange-500/50 transition-all text-left min-h-[80px]"
          >
            <div className="h-12 w-12 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
              <Banknote className="h-6 w-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-base">Withdrawals & Payouts</p>
              <p className="text-xs text-muted-foreground">Process & verify cash-out requests</p>
            </div>
          </button>

          {/* Wallet Deductions */}
          <button
            onClick={() => openTool('deductions')}
            className="flex items-center gap-4 p-5 rounded-2xl border-2 border-destructive/20 bg-destructive/5 hover:bg-destructive/10 hover:border-destructive/40 transition-all text-left min-h-[80px]"
          >
            <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <MinusCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-base">Wallet Deductions</p>
              <p className="text-xs text-muted-foreground">Retractions, corrections & penalties</p>
            </div>
          </button>

          {/* Ledger */}
          <button
            onClick={() => openTool('ledgers')}
            className="flex items-center gap-4 p-5 rounded-2xl border-2 border-muted bg-muted/30 hover:bg-muted/50 hover:border-muted-foreground/30 transition-all text-left min-h-[80px]"
          >
            <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-base">Ledger</p>
              <p className="text-xs text-muted-foreground">Full financial record of all wallet activity</p>
            </div>
          </button>
        </div>
      </div>

      {/* ═══ SUPPORT: Additional Tools ═══ */}
      <div>
        <button
          onClick={() => setSupportSheet(true)}
          className="w-full flex items-center justify-between p-3.5 rounded-xl border border-border hover:bg-accent/30 transition-colors"
        >
          <span className="text-sm font-semibold text-muted-foreground">Support Tools</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Support Tools Sheet */}
      <Sheet open={supportSheet} onOpenChange={setSupportSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
          <SheetHeader>
            <SheetTitle>Support Tools</SheetTitle>
            <SheetDescription>Ops, search, reconciliation & reporting</SheetDescription>
          </SheetHeader>
          <div className="grid gap-1.5 mt-4">
            {supportTools.map(t => (
              <button
                key={t.id}
                onClick={() => openTool(t.id)}
                className="flex items-center gap-3 p-4 rounded-xl hover:bg-accent/40 transition-colors text-left"
              >
                <t.icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm block">{t.label}</span>
                  <span className="text-[11px] text-muted-foreground">{t.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
