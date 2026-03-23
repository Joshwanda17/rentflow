import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { ChannelBalanceTracker } from '@/components/cfo/ChannelBalanceTracker';

import { FinancialStatementsPanel } from '@/components/manager/FinancialStatementsPanel';
import { BufferAccountPanel } from '@/components/manager/BufferAccountPanel';
import { SupporterROITrigger } from '@/components/manager/SupporterROITrigger';
import { AgentCommissionPayoutsManager } from '@/components/manager/AgentCommissionPayoutsManager';
import { WithdrawalRequestsManager } from '@/components/manager/WithdrawalRequestsManager';
import { GeneralLedger } from '@/components/manager/GeneralLedger';
import { FinancialOverview } from '@/components/manager/FinancialOverview';
import CFOReconciliationPanel from '@/components/cfo/CFOReconciliationPanel';
import { CFOWithdrawalApprovals } from '@/components/cfo/CFOWithdrawalApprovals';
import { RentPipelineQueue } from '@/components/executive/RentPipelineQueue';
import { ListingBonusApprovalQueue } from '@/components/executive/ListingBonusApprovalQueue';
import { FinancialAgentsPanel } from '@/components/cfo/FinancialAgentsPanel';
import { ProxyAgentManager } from '@/components/cfo/ProxyAgentManager';
import { PayrollPanel } from '@/components/cfo/PayrollPanel';

export default function CFODashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const renderContent = () => {
    switch (activeTab) {
      case 'rent-payouts':
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">💰 Rent Payout Authorization</h1>
            <p className="text-sm text-muted-foreground">
              Approve rent payouts to landlords. Enter the transaction reference to confirm disbursement.
              For landlords without a Rent Money wallet, select "Cash Payout" as the method.
            </p>
            <RentPipelineQueue stage="coo_approved" />
          </div>
        );
      case 'statements':
        return <FinancialStatementsPanel />;
      case 'solvency':
        return (
          <div className="space-y-6">
            <BufferAccountPanel />
            <SupporterROITrigger />
          </div>
        );
      case 'reconciliation':
        return <CFOReconciliationPanel />;
      case 'ledger':
        return <GeneralLedger />;
      case 'commissions':
        return <AgentCommissionPayoutsManager />;
      case 'withdrawals':
        return (
          <div className="space-y-6">
            <WithdrawalRequestsManager />
            <CFOWithdrawalApprovals />
          </div>
        );
      case 'financial-agents':
        return <FinancialAgentsPanel />;
      case 'proxy-agents':
        return <ProxyAgentManager />;
      case 'payroll':
        return <PayrollPanel />;
      default:
        return (
          <div className="space-y-6">
            <FinancialOverview />
            <ListingBonusApprovalQueue filter="pending_cfo" />
            <RentPipelineQueue stage="coo_approved" />
          </div>
        );
    }
  };

  return (
    <ExecutiveDashboardLayout role="cfo" activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </ExecutiveDashboardLayout>
  );
}
