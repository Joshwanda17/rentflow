import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { CTODashboard } from '@/components/executive/CTODashboard';

export default function CTODashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <ExecutiveDashboardLayout role="cto" activeTab={activeTab} onTabChange={setActiveTab}>
      <CTODashboard activeTab={activeTab} />
    </ExecutiveDashboardLayout>
  );
}
