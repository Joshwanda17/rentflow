import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { CMODashboard } from '@/components/executive/CMODashboard';
import { DirectorRequisitionsPanel } from '@/components/requisitions/DirectorRequisitionsPanel';

export default function CMODashboardPage() {
  const [activeTab, setActiveTab] = usePersistedActiveTab('cmo');

  return (
    <ExecutiveDashboardLayout role="cmo" activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'requisitions' ? (
        <DirectorRequisitionsPanel />
      ) : (
        <CMODashboard activeTab={activeTab} />
      )}
    </ExecutiveDashboardLayout>
  );
}
