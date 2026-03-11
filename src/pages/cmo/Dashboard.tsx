import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { CMODashboard } from '@/components/executive/CMODashboard';

export default function CMODashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <ExecutiveDashboardLayout role="cmo" activeTab={activeTab} onTabChange={setActiveTab}>
      <CMODashboard />
    </ExecutiveDashboardLayout>
  );
}
