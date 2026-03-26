import { useState } from 'react';
import { FinancialOpsPulseStrip } from './FinancialOpsPulseStrip';
import { ApprovalQueue } from './ApprovalQueue';
import { TransactionSearch } from './TransactionSearch';
import { ReconciliationDashboard } from './ReconciliationDashboard';
import { AuditFeed } from './AuditFeed';
import { TidVerification } from './TidVerification';
import { ScaleDashboard } from './ScaleDashboard';
import { FloatPayoutVerification } from './FloatPayoutVerification';
import { LedgerHub } from '@/components/ledgers/LedgerHub';
import { PendingWalletOperationsWidget } from '@/components/manager/PendingWalletOperationsWidget';
import { DepositStatsPanel } from './DepositStatsPanel';
import { 
  ShieldCheck, Banknote, X, ArrowLeft, Menu, ChevronDown, ChevronUp,
  ClipboardList, Search, Scale, Shield, Gauge, BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AnimatePresence } from 'framer-motion';

type View = 'home' | 'deposits' | 'withdrawals';
type Tool = null | 'ops' | 'queue' | 'search' | 'recon' | 'ledgers' | 'audit';

const tools = [
  { id: 'ops' as const, label: 'Ops Center', icon: Gauge },
  { id: 'queue' as const, label: 'Approval Queue', icon: ClipboardList },
  { id: 'search' as const, label: 'Transaction Search', icon: Search },
  { id: 'recon' as const, label: 'Reconciliation', icon: Scale },
  { id: 'ledgers' as const, label: 'Ledgers', icon: BookOpen },
  { id: 'audit' as const, label: 'Audit Trail', icon: Shield },
];

export function FinancialOpsCommandCenter() {
  const [view, setView] = useState<View>('home');
  const [toolSheet, setToolSheet] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>(null);
  const [showDepositStats, setShowDepositStats] = useState(false);

  const openTool = (t: Tool) => {
    setActiveTool(t);
    setToolSheet(false);
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
          Verify Deposits
        </h2>
        <TidVerification />
      </div>
    );
  }

  // Sub-view: Withdrawals & Payouts
  if (view === 'withdrawals') {
    return (
      <div className="space-y-4">
        <button onClick={() => setView('home')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Banknote className="h-5 w-5 text-destructive" />
          Withdrawals & Payouts
        </h2>
        <PendingWalletOperationsWidget />
        <FloatPayoutVerification />
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
      </div>
    );
  }

  // Home: 2 buttons + menu
  return (
    <div className="space-y-6">
      <FinancialOpsPulseStrip />

      <div className="grid grid-cols-1 gap-4">
        {/* Verify Deposits */}
        <button
          onClick={() => setView('deposits')}
          className="flex items-center gap-4 p-5 rounded-2xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-left min-h-[80px]"
        >
          <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-bold text-base">Verify Deposits</p>
            <p className="text-xs text-muted-foreground">TID match & approve manual deposits</p>
          </div>
        </button>

        {/* Withdrawals & Payouts */}
        <button
          onClick={() => setView('withdrawals')}
          className="flex items-center gap-4 p-5 rounded-2xl border-2 border-destructive/30 bg-destructive/5 hover:bg-destructive/10 hover:border-destructive/50 transition-all text-left min-h-[80px]"
        >
          <div className="h-12 w-12 rounded-xl bg-destructive/15 flex items-center justify-center shrink-0">
            <Banknote className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <p className="font-bold text-base">Withdrawals & Payouts</p>
            <p className="text-xs text-muted-foreground">Process wallet & float payouts</p>
          </div>
        </button>
      </div>

      {/* More Tools Button */}
      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => setToolSheet(true)}
      >
        <Menu className="h-4 w-4" />
        More Tools
      </Button>

      {/* Tools Sheet */}
      <Sheet open={toolSheet} onOpenChange={setToolSheet}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh]">
          <SheetHeader>
            <SheetTitle>Financial Tools</SheetTitle>
            <SheetDescription>Additional operations & reporting</SheetDescription>
          </SheetHeader>
          <div className="grid gap-2 mt-4">
            {tools.map(t => (
              <button
                key={t.id}
                onClick={() => openTool(t.id)}
                className="flex items-center gap-3 p-4 rounded-xl hover:bg-accent/40 transition-colors text-left"
              >
                <t.icon className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-sm">{t.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
