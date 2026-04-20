import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { ChannelBalanceTracker } from '@/components/cfo/ChannelBalanceTracker';
import { PlatformVsWalletSummary } from '@/components/cfo/PlatformVsWalletSummary';
import { CFOROIRequests } from '@/components/cfo/CFOROIRequests';
import { CFOOverviewDashboard } from '@/components/cfo/CFOOverviewDashboard';
import { DirectCreditTool } from '@/components/cfo/DirectCreditTool';
import { RevenueExpenseDashboard } from '@/components/cfo/RevenueExpenseDashboard';

import { FinancialStatementsPanel } from '@/components/manager/FinancialStatementsPanel';
import { BufferAccountPanel } from '@/components/manager/BufferAccountPanel';
import { SupporterROITrigger } from '@/components/manager/SupporterROITrigger';
import { AgentCommissionPayoutsManager } from '@/components/manager/AgentCommissionPayoutsManager';
import { WithdrawalRequestsManager } from '@/components/manager/WithdrawalRequestsManager';
import { GeneralLedger } from '@/components/manager/GeneralLedger';
import { FinancialOverview } from '@/components/manager/FinancialOverview';
import CFOReconciliationPanel from '@/components/cfo/CFOReconciliationPanel';

import { CFOPartnerPayoutProcessing } from '@/components/cfo/CFOPartnerPayoutProcessing';
import { RentPipelineQueue } from '@/components/executive/RentPipelineQueue';
import { ListingBonusApprovalQueue } from '@/components/executive/ListingBonusApprovalQueue';
import { FinancialAgentsPanel } from '@/components/cfo/FinancialAgentsPanel';
import { ProxyAgentManager } from '@/components/cfo/ProxyAgentManager';
import { PayrollPanel } from '@/components/cfo/PayrollPanel';
import { CashoutAgentManager } from '@/components/cfo/CashoutAgentManager';
import { CashoutAgentActivity } from '@/components/cfo/CashoutAgentActivity';
import { DeliveryPipelineTracker } from '@/components/cfo/DeliveryPipelineTracker';
import { AgentCashReconciliation } from '@/components/cfo/AgentCashReconciliation';
import { LandlordOpsPayoutReview } from '@/components/cfo/LandlordOpsPayoutReview';
import { CFOReceivablesTracker } from '@/components/cfo/CFOReceivablesTracker';
import { LedgerHub } from '@/components/ledgers/LedgerHub';
import { PendingPortfolioTopUps } from '@/components/cfo/PendingPortfolioTopUps';
import { AngelPoolManagementPanel } from '@/components/executive/AngelPoolManagementPanel';
import { WalletRetractionsFeed } from '@/components/cfo/WalletRetractionsFeed';
import { CFOAdvancesManager } from '@/components/cfo/CFOAdvancesManager';
import { CFOAdvanceRequestPayments } from '@/components/cfo/CFOAdvanceRequestPayments';
import { BusinessAdvanceQueue } from '@/components/ops/BusinessAdvanceQueue';
import { ManagerApprovalAudit } from '@/components/cfo/ManagerApprovalAudit';
import { CFOAgentRequisitions } from '@/components/cfo/CFOAgentRequisitions';
import { RentCollectionsFeed } from '@/components/cfo/RentCollectionsFeed';
import { AgentPerformanceRankings } from '@/components/cfo/AgentPerformanceRankings';
import { AgentFloatManagement } from '@/components/cfo/AgentFloatManagement';
import { LedgerHealthPanel } from '@/components/cfo/LedgerHealthPanel';
import { FieldCashExposureCard } from '@/components/cfo/FieldCashExposureCard';
import { CFOAgentOpsFloatSender } from '@/components/cfo/CFOAgentOpsFloatSender';

export default function CFODashboardPage() {
  const { currency, setCurrency, getCurrencyByCode } = useCurrency();
  const [activeTab, setActiveTab] = useState('overview');

  // Force UGX on CFO dashboard — financial reporting must always be in base currency
  useEffect(() => {
    if (currency.code !== 'UGX') {
      const ugx = getCurrencyByCode('UGX');
      if (ugx) setCurrency(ugx);
    }
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'wallet-payout':
        return (
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
              <button onClick={() => setActiveTab('overview')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to Treasury
              </button>
              <h1 className="text-xl font-bold flex items-center gap-2 mb-1">💳 Pay Out to Any User's Wallet</h1>
              <p className="text-sm text-muted-foreground mb-4">Search a user by name or phone number, enter the amount, and credit or debit their wallet instantly.</p>
              <DirectCreditTool />
            </div>
          </div>
        );
      case 'roi-requests':
        return <CFOROIRequests />;
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
            <CFOPartnerPayoutProcessing />
          </div>
        );
      case 'financial-agents':
        return <FinancialAgentsPanel />;
      case 'proxy-agents':
        return <ProxyAgentManager />;
      case 'cashout-agents':
        return <CashoutAgentManager />;
      case 'agent-activity':
        return <CashoutAgentActivity />;
      case 'payroll':
        return <PayrollPanel />;
      case 'delivery-pipeline':
        return <DeliveryPipelineTracker />;
      case 'cash-reconciliation':
        return <AgentCashReconciliation />;
      case 'landlord-payouts':
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">🏠 Agent Landlord Payout Verification</h1>
            <p className="text-sm text-muted-foreground">
              Review and sign off on agent-to-landlord MoMo payouts after Landlord Ops approval.
            </p>
            <LandlordOpsPayoutReview reviewRole="cfo" />
          </div>
        );
      case 'advanced-ledgers':
        return <LedgerHub />;
      case 'partner-topups':
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">📊 Partner Top-ups</h1>
            <p className="text-sm text-muted-foreground">Pending portfolio top-up requests awaiting verification.</p>
            <PendingPortfolioTopUps />
          </div>
        );
      case 'angel-pool':
        return <AngelPoolManagementPanel userRole="cfo" />;
      case 'retractions':
        return <WalletRetractionsFeed />;
      case 'advances':
        return (
          <div className="space-y-6">
            <CFOAdvanceRequestPayments />
            <BusinessAdvanceQueue stage="cfo" />
            <CFOAdvancesManager />
          </div>
        );
      case 'approval-audit':
        return <ManagerApprovalAudit />;
      case 'agent-requisitions':
        return <CFOAgentRequisitions />;
      case 'rent-collections':
        return <RentCollectionsFeed />;
      case 'agent-rankings':
        return <AgentPerformanceRankings />;
      case 'float-management':
        return (
          <div className="space-y-6">
            <CFOAgentOpsFloatSender />
            <AgentFloatManagement />
            <FieldCashExposureCard />
          </div>
        );
      case 'ledger-health':
        return <LedgerHealthPanel />;
      case 'revenue-expenses':
        return <RevenueExpenseDashboard />;
      default:
        return <CFOOverviewDashboard onTabChange={setActiveTab} />;
    }
  };

  return (
    <ExecutiveDashboardLayout role="cfo" activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </ExecutiveDashboardLayout>
  );
}
