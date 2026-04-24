import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { CMODashboard } from '@/components/executive/CMODashboard';

export default function CMODashboardPage() {
  const [activeTab, setActiveTab] = usePersistedActiveTab('cmo');

  return (
    <ExecutiveDashboardLayout role="cmo" activeTab={activeTab} onTabChange={setActiveTab}>
      <CMODashboard />
    </ExecutiveDashboardLayout>
  );
}
