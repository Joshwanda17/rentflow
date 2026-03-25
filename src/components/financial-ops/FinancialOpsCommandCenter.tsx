import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { 
  ClipboardList, Search, Scale, Shield, LayoutDashboard, 
  ShieldCheck, Gauge, Landmark, BookOpen, ArrowDownToLine, Banknote, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { motion, AnimatePresence } from 'framer-motion';

type ActivePanel = null | 'deposits' | 'withdrawals';

export function FinancialOpsCommandCenter() {
  const [tab, setTab] = useState('ops');
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  const handleOpenDeposits = () => setActivePanel('deposits');
  const handleOpenWithdrawals = () => setActivePanel('withdrawals');
  const handleClosePanel = () => setActivePanel(null);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          Financial Ops
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Verify deposits · Process withdrawals & payouts
        </p>
      </div>

      {/* Pulse Strip */}
      <FinancialOpsPulseStrip />

      {/* ===== 2 PROMINENT ACTION BUTTONS ===== */}
      <div className="grid grid-cols-2 gap-3">
        {/* Verify Deposits Button */}
        <motion.button
          type="button"
          onClick={handleOpenDeposits}
          whileTap={{ scale: 0.97 }}
          className={`
            relative overflow-hidden rounded-2xl border-2 p-4 sm:p-5 text-left transition-all
            min-h-[100px] sm:min-h-[120px] select-none
            ${activePanel === 'deposits' 
              ? 'border-primary bg-primary text-primary-foreground shadow-lg' 
              : 'border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 hover:shadow-md'}
          `}
          style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        >
          <div className="flex flex-col gap-2">
            <div className={`
              h-11 w-11 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center
              ${activePanel === 'deposits' ? 'bg-primary-foreground/20' : 'bg-primary/15'}
            `}>
              <ShieldCheck className={`h-6 w-6 sm:h-7 sm:w-7 ${activePanel === 'deposits' ? 'text-primary-foreground' : 'text-primary'}`} />
            </div>
            <div>
              <p className="font-bold text-sm sm:text-base tracking-tight">Verify Deposits</p>
              <p className={`text-[10px] sm:text-xs mt-0.5 ${activePanel === 'deposits' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                TID match & approve
              </p>
            </div>
          </div>
        </motion.button>

        {/* Process Withdrawals & Payouts Button */}
        <motion.button
          type="button"
          onClick={handleOpenWithdrawals}
          whileTap={{ scale: 0.97 }}
          className={`
            relative overflow-hidden rounded-2xl border-2 p-4 sm:p-5 text-left transition-all
            min-h-[100px] sm:min-h-[120px] select-none
            ${activePanel === 'withdrawals' 
              ? 'border-destructive bg-destructive text-destructive-foreground shadow-lg' 
              : 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10 hover:border-destructive/60 hover:shadow-md'}
          `}
          style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        >
          <div className="flex flex-col gap-2">
            <div className={`
              h-11 w-11 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center
              ${activePanel === 'withdrawals' ? 'bg-destructive-foreground/20' : 'bg-destructive/15'}
            `}>
              <Banknote className={`h-6 w-6 sm:h-7 sm:w-7 ${activePanel === 'withdrawals' ? 'text-destructive-foreground' : 'text-destructive'}`} />
            </div>
            <div>
              <p className="font-bold text-sm sm:text-base tracking-tight">Withdrawals & Payouts</p>
              <p className={`text-[10px] sm:text-xs mt-0.5 ${activePanel === 'withdrawals' ? 'text-destructive-foreground/70' : 'text-muted-foreground'}`}>
                Wallet & float payouts
              </p>
            </div>
          </div>
        </motion.button>
      </div>

      {/* ===== INLINE PANEL FOR DEPOSITS ===== */}
      <AnimatePresence>
        {activePanel === 'deposits' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border-2 border-primary/30 bg-card p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm sm:text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Deposit Verification
                </h2>
                <Button variant="ghost" size="icon-sm" onClick={handleClosePanel}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <TidVerification />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== INLINE PANEL FOR WITHDRAWALS & PAYOUTS ===== */}
      <AnimatePresence>
        {activePanel === 'withdrawals' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border-2 border-destructive/30 bg-card p-3 sm:p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm sm:text-base flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-destructive" />
                  Withdrawals & Float Payouts
                </h2>
                <Button variant="ghost" size="icon-sm" onClick={handleClosePanel}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <PendingWalletOperationsWidget />
              <FloatPayoutVerification />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== MENU BAR FOR OTHER TOOLS ===== */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-none">
          <TabsList className="h-9 w-max sm:w-full justify-start">
            <TabsTrigger value="ops" className="text-[11px] sm:text-xs gap-1 px-3 sm:px-4 shrink-0 min-h-[36px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold">
              <Gauge className="h-3.5 w-3.5" /> Ops Center
            </TabsTrigger>
            <TabsTrigger value="queue" className="text-[11px] sm:text-xs gap-1 px-2.5 sm:px-3 shrink-0 min-h-[36px]">
              <ClipboardList className="h-3.5 w-3.5" /> Queue
            </TabsTrigger>
            <TabsTrigger value="search" className="text-[11px] sm:text-xs gap-1 px-2.5 sm:px-3 shrink-0 min-h-[36px]">
              <Search className="h-3.5 w-3.5" /> Search
            </TabsTrigger>
            <TabsTrigger value="reconciliation" className="text-[11px] sm:text-xs gap-1 px-2.5 sm:px-3 shrink-0 min-h-[36px]">
              <Scale className="h-3.5 w-3.5" /> Recon
            </TabsTrigger>
            <TabsTrigger value="ledgers" className="text-[11px] sm:text-xs gap-1 px-2.5 sm:px-3 shrink-0 min-h-[36px] data-[state=active]:bg-chart-1 data-[state=active]:text-white">
              <BookOpen className="h-3.5 w-3.5" /> Ledgers
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-[11px] sm:text-xs gap-1 px-2.5 sm:px-3 shrink-0 min-h-[36px]">
              <Shield className="h-3.5 w-3.5" /> Audit
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ops" className="mt-2 sm:mt-3">
          <ScaleDashboard />
        </TabsContent>
        <TabsContent value="queue" className="mt-2 sm:mt-3">
          <ApprovalQueue />
        </TabsContent>
        <TabsContent value="search" className="mt-2 sm:mt-3">
          <TransactionSearch />
        </TabsContent>
        <TabsContent value="reconciliation" className="mt-2 sm:mt-3">
          <ReconciliationDashboard />
        </TabsContent>
        <TabsContent value="ledgers" className="mt-2 sm:mt-3">
          <LedgerHub />
        </TabsContent>
        <TabsContent value="audit" className="mt-2 sm:mt-3">
          <AuditFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}
