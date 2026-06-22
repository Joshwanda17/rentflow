import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { CRMDashboard } from '@/components/executive/CRMDashboard';
import { CRMDirectoryPanel } from '@/components/executive/CRMDirectoryPanel';

export default function CRMDashboardPage() {
  const [activeTab, setActiveTab] = usePersistedActiveTab('crm');

  const renderContent = () => {
    switch (activeTab) {
      case 'all-tenants':
        return (
          <CRMDirectoryPanel
            role="tenant"
            title="All Tenants"
            subtitle="Every tenant on the platform with full profile details. Click a row to view more."
          />
        );
      case 'all-agents':
        return (
          <CRMDirectoryPanel
            role="agent"
            title="All Agents"
            subtitle="Every agent on the platform with full profile details. Click a row to view more."
          />
        );
      default:
        return <CRMDashboard />;
    }
  };

  return (
    <ExecutiveDashboardLayout role="crm" activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </ExecutiveDashboardLayout>
  );
}
