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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          Financial Operations Center
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage deposits, withdrawals, and ledger operations at scale
        </p>
      </div>

      {/* Live Pulse Strip — always visible */}
      <FinancialOpsPulseStrip />

      {/* Tab Navigation */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9 w-full justify-start overflow-x-auto">
          <TabsTrigger value="queue" className="text-xs gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" /> Queue
          </TabsTrigger>
          <TabsTrigger value="tid" className="text-xs gap-1.5">
            <Hash className="h-3.5 w-3.5" /> TID Verify
          </TabsTrigger>
          <TabsTrigger value="search" className="text-xs gap-1.5">
            <Search className="h-3.5 w-3.5" /> Search
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="text-xs gap-1.5">
            <Scale className="h-3.5 w-3.5" /> Reconciliation
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-3">
          <ApprovalQueue />
        </TabsContent>
        <TabsContent value="tid" className="mt-3">
          <TidVerification />
        </TabsContent>
        <TabsContent value="search" className="mt-3">
          <TransactionSearch />
        </TabsContent>
        <TabsContent value="reconciliation" className="mt-3">
          <ReconciliationDashboard />
        </TabsContent>
        <TabsContent value="audit" className="mt-3">
          <AuditFeed />
        </TabsContent>
      </Tabs>
    </div>
  );
}
