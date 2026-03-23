import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FinancialOpsPulseStrip } from './FinancialOpsPulseStrip';
import { ApprovalQueue } from './ApprovalQueue';
import { TransactionSearch } from './TransactionSearch';
import { ReconciliationDashboard } from './ReconciliationDashboard';
import { AuditFeed } from './AuditFeed';
import { TidVerification } from './TidVerification';
import { ClipboardList, Search, Scale, Shield, LayoutDashboard, Hash } from 'lucide-react';

export function FinancialOpsCommandCenter() {
  const [tab, setTab] = useState('queue');

  return (
    <div className="space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          Financial Ops
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Manage deposits, withdrawals & ledger operations
        </p>
      </div>

      <FinancialOpsPulseStrip />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-none">
          <TabsList className="h-9 w-max sm:w-full justify-start">
            <TabsTrigger value="queue" className="text-[11px] sm:text-xs gap-1 px-2.5 sm:px-3 shrink-0 min-h-[36px]">
              <ClipboardList className="h-3.5 w-3.5" /> Queue
            </TabsTrigger>
            <TabsTrigger value="tid" className="text-[11px] sm:text-xs gap-1 px-2.5 sm:px-3 shrink-0 min-h-[36px]">
              <Hash className="h-3.5 w-3.5" /> TID
            </TabsTrigger>
            <TabsTrigger value="search" className="text-[11px] sm:text-xs gap-1 px-2.5 sm:px-3 shrink-0 min-h-[36px]">
              <Search className="h-3.5 w-3.5" /> Search
            </TabsTrigger>
            <TabsTrigger value="reconciliation" className="text-[11px] sm:text-xs gap-1 px-2.5 sm:px-3 shrink-0 min-h-[36px]">
              <Scale className="h-3.5 w-3.5" /> Recon
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-[11px] sm:text-xs gap-1 px-2.5 sm:px-3 shrink-0 min-h-[36px]">
              <Shield className="h-3.5 w-3.5" /> Audit
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="queue" className="mt-2 sm:mt-3">
          <ApprovalQueue />
        </TabsContent>
        <TabsContent value="tid" className="mt-2 sm:mt-3">
          <TidVerification />
        </TabsContent>
        <TabsContent value="search" className="mt-2 sm:mt-3">
          <TransactionSearch />
        </TabsContent>
        <TabsContent value="reconciliation" className="mt-2 sm:mt-3">
          <ReconciliationDashboard />
        </TabsContent>
        <TabsContent value="audit" className="mt-2 sm:mt-3">
          <AuditFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}
