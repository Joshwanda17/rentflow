import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { CEODashboard } from '@/components/executive/CEODashboard';
import { StaffPerformancePanel } from '@/components/executive/StaffPerformancePanel';

export default function CEODashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  const renderContent = () => {
    switch (activeTab) {
      case 'staff-performance':
        return <StaffPerformancePanel />;
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
