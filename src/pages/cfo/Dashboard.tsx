import { useEffect } from 'react';
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
import { CFOPartnerPayoutProcessing } from '@/components/cfo/CFOPartnerPayoutProcessing';
import { RentDisbursementQueue } from '@/components/cfo/RentDisbursementQueue';
import { BatchPayoutProcessor } from '@/components/cfo/BatchPayoutProcessor';
import { LandlordFloatAllocationsPanel } from '@/components/cfo/LandlordFloatAllocationsPanel';
import { WithdrawalHistoryStatement } from '@/components/financial-ops/WithdrawalHistoryStatement';
import { RentPipelineQueue } from '@/components/executive/RentPipelineQueue';
import { RejectedRequestsQueue } from '@/components/executive/RejectedRequestsQueue';
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
import { OpportunitySummaryForm } from '@/components/manager/OpportunitySummaryForm';
import { CFOAgentRequisitions } from '@/components/cfo/CFOAgentRequisitions';
import { RentCollectionsFeed } from '@/components/cfo/RentCollectionsFeed';
import { AgentPerformanceRankings } from '@/components/cfo/AgentPerformanceRankings';
import { AgentFloatManagement } from '@/components/cfo/AgentFloatManagement';
import { LedgerHealthPanel } from '@/components/cfo/LedgerHealthPanel';
import { FieldCashExposureCard } from '@/components/cfo/FieldCashExposureCard';
import { CFOAgentOpsFloatSender } from '@/components/cfo/CFOAgentOpsFloatSender';
import { CFOImpactKPIStrip } from '@/components/cfo/CFOImpactKPIStrip';
import { CFOWalletActivities } from '@/components/cfo/CFOWalletActivities';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';

export default function CFODashboardPage() {
  const { currency, setCurrency, getCurrencyByCode } = useCurrency();
  const [activeTab, setActiveTab] = usePersistedActiveTab('cfo');

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
            <RejectedRequestsQueue stageFilter="coo_approved" title="Rejected at CFO" />
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
        return (
          <div className="space-y-6">
            <div className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Reconciliation</p>
              <p>
                Drift monitoring has been retired. Money-flow safety is now enforced
                directly by the Wallet Sole Writer, the Strict Pivot view, and the
                Wallet Write Lockdown trigger — every wallet read returns the
                ledger-true figure by construction, so there is nothing left to
                reconcile asynchronously.
              </p>
            </div>
          </div>
        );
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
      case 'withdrawal-history':
        return <WithdrawalHistoryStatement />;
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
      case 'landlord-payout-float':
        return (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold">🏠 Landlord Payout Float</h1>
              <p className="text-sm text-muted-foreground">
                Fund agents' Landlord Payout Float from COO-approved rent requests.
                Each disbursement earmarks money for a specific tenant's landlord —
                the agent then pays the landlord via MoMo (gated by landlord OTP and Financial Ops sign-off).
              </p>
            </div>
            <RentDisbursementQueue />
            <BatchPayoutProcessor />
            <LandlordFloatAllocationsPanel />
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
      case 'capital-opportunities':
        return (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold">📈 Capital Opportunities</h1>
              <p className="text-sm text-muted-foreground">
                Edit the total rent demand and opportunity summary shown to funders.
              </p>
            </div>
            <OpportunitySummaryForm />
          </div>
        );
      case 'revenue-expenses':
        return <RevenueExpenseDashboard />;
      case 'platform-impact':
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Platform Impact</h2>
              <p className="text-sm text-muted-foreground">
                People and partners actively using Welile. Tap any tile for the underlying records.
              </p>
            </div>
            <CFOImpactKPIStrip />
          </div>
        );
      case 'wallet-activities':
        return <CFOWalletActivities />;
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
