import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { CRMDashboard } from '@/components/executive/CRMDashboard';

export default function CRMDashboardPage() {
  const [activeTab, setActiveTab] = usePersistedActiveTab('crm');

  return (
    <ExecutiveDashboardLayout role="crm" activeTab={activeTab} onTabChange={setActiveTab}>
      <CRMDashboard />
    </ExecutiveDashboardLayout>
  );
}
