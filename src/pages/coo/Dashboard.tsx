import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { COOWithdrawalApprovals } from '@/components/coo/COOWithdrawalApprovals';
import FinancialMetricsCards from '@/components/coo/FinancialMetricsCards';
import FinancialTransactionsTable from '@/components/coo/FinancialTransactionsTable';
import AgentCollectionsOverview from '@/components/coo/AgentCollectionsOverview';
import PaymentModeAnalytics from '@/components/coo/PaymentModeAnalytics';
import FinancialReportsPanel from '@/components/coo/FinancialReportsPanel';
import FinancialAlertsPanel from '@/components/coo/FinancialAlertsPanel';
import COOPartnersPage from '@/components/coo/COOPartnersPage';
import { StaffPerformancePanel } from '@/components/executive/StaffPerformancePanel';
import { RentPipelineQueue } from '@/components/executive/RentPipelineQueue';
import { FinancialOpsCommandCenter } from '@/components/financial-ops/FinancialOpsCommandCenter';
import { CashoutAgentActivity } from '@/components/cfo/CashoutAgentActivity';

export default function COODashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const renderContent = () => {
    switch (activeTab) {
      case 'rent-approvals':
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">🏠 Rent Request Approvals</h1>
            <p className="text-sm text-muted-foreground">Review rent requests approved by Landlord Ops. Your sign-off forwards to CFO for payout.</p>
            <RentPipelineQueue stage="landlord_ops_approved" />
          </div>
        );
      case 'transactions':
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Transaction Monitoring</h1>
            <FinancialTransactionsTable />
          </div>
        );
      case 'collections':
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Agent Collections</h1>
            <AgentCollectionsOverview />
          </div>
        );
      case 'wallets':
        return <FinancialOpsCommandCenter />;
      case 'agent-activity':
        return <CashoutAgentActivity />;
      case 'analytics':
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Payment Analytics</h1>
            <PaymentModeAnalytics />
          </div>
        );
      case 'reports':
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Financial Reports</h1>
            <FinancialReportsPanel />
          </div>
        );
      case 'alerts':
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Risk & Alerts</h1>
            <FinancialAlertsPanel />
          </div>
        );
      case 'withdrawals':
        return <COOWithdrawalApprovals />;
      case 'partners':
        return <COOPartnersPage />;
      case 'staff-performance':
        return <StaffPerformancePanel />;
      default:
        return (
          <div className="space-y-6">
            <h1 className="text-xl font-bold">Financial Operations Dashboard</h1>
            {/* 🔥 PRIORITY: Rent Approval Queue on overview */}
            <RentPipelineQueue stage="landlord_ops_approved" />
            <FinancialMetricsCards />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PaymentModeAnalytics />
              <FinancialAlertsPanel />
            </div>
            <AgentCollectionsOverview />
            <FinancialOpsCommandCenter />
          </div>
        );
    }
  };

  return (
    <ExecutiveDashboardLayout role="coo" activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </ExecutiveDashboardLayout>
  );
}
