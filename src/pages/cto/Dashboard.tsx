import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { CTODashboard } from '@/components/executive/CTODashboard';

export default function CTODashboardPage() {
  const [activeTab, setActiveTab] = usePersistedActiveTab('cto');

  return (
    <ExecutiveDashboardLayout role="cto" activeTab={activeTab} onTabChange={setActiveTab}>
      <CTODashboard activeTab={activeTab} />
    </ExecutiveDashboardLayout>
  );
}
