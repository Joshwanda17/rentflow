import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { CEODashboard } from '@/components/executive/CEODashboard';

export default function CEODashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <ExecutiveDashboardLayout role="ceo" activeTab={activeTab} onTabChange={setActiveTab}>
      <CEODashboard />
    </ExecutiveDashboardLayout>
  );
}
