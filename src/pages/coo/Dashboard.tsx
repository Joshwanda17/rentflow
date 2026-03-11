import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { COOWithdrawalApprovals } from '@/components/coo/COOWithdrawalApprovals';
import FinancialMetricsCards from '@/components/coo/FinancialMetricsCards';
import FinancialTransactionsTable from '@/components/coo/FinancialTransactionsTable';
import AgentCollectionsOverview from '@/components/coo/AgentCollectionsOverview';
import WalletMonitoringPanel from '@/components/coo/WalletMonitoringPanel';
import PaymentModeAnalytics from '@/components/coo/PaymentModeAnalytics';
import FinancialReportsPanel from '@/components/coo/FinancialReportsPanel';
import FinancialAlertsPanel from '@/components/coo/FinancialAlertsPanel';
import COOPartnersPage from '@/components/coo/COOPartnersPage';

export default function COODashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const renderContent = () => {
    switch (activeTab) {
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
        return (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Wallet Monitoring</h1>
            <WalletMonitoringPanel />
          </div>
        );
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
      default:
        return (
          <div className="space-y-6">
            <h1 className="text-xl font-bold">Financial Operations Dashboard</h1>
            <FinancialMetricsCards />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PaymentModeAnalytics />
              <FinancialAlertsPanel />
            </div>
            <AgentCollectionsOverview />
            <WalletMonitoringPanel />
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
