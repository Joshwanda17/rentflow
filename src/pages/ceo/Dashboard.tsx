import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { usePersistedActiveTab } from '@/hooks/usePersistedActiveTab';
import { CEODashboard } from '@/components/executive/CEODashboard';
import { StaffPerformancePanel } from '@/components/executive/StaffPerformancePanel';
import { AngelPoolManagementPanel } from '@/components/executive/AngelPoolManagementPanel';
import { MissionGoalsEditor } from '@/components/executive/MissionGoalsEditor';
import { RoleManagementPanel } from '@/components/executive/RoleManagementPanel';
import { DirectorRequisitionsPanel } from '@/components/requisitions/DirectorRequisitionsPanel';

export default function CEODashboardPage() {
  const [activeTab, setActiveTab] = usePersistedActiveTab('ceo');

  const renderContent = () => {
    switch (activeTab) {
      case 'staff-performance':
        return <StaffPerformancePanel />;
      case 'requisitions':
        return <DirectorRequisitionsPanel />;
      case 'angel-pool':
        return <AngelPoolManagementPanel userRole="ceo" />;
      case 'mission-goals':
        return <MissionGoalsEditor />;
      case 'role-management':
        return <RoleManagementPanel />;
      default:
        return <CEODashboard />;
    }
  };

  return (
    <ExecutiveDashboardLayout role="ceo" activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </ExecutiveDashboardLayout>
  );
}
