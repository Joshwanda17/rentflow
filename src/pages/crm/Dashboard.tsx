import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import { CRMDashboard } from '@/components/executive/CRMDashboard';

export default function CRMDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <ExecutiveDashboardLayout role="crm" activeTab={activeTab} onTabChange={setActiveTab}>
      <CRMDashboard />
    </ExecutiveDashboardLayout>
  );
}
