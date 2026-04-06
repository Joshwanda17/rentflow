import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import HROverview from '@/components/hr/HROverview';
import HREmployeeDirectory from '@/components/hr/HREmployeeDirectory';
import HRLeaveManagement from '@/components/hr/HRLeaveManagement';
import HRPayroll from '@/components/hr/HRPayroll';
import HRDisciplinary from '@/components/hr/HRDisciplinary';
import HRAudit from '@/components/hr/HRAudit';

export default function HRDashboard() {
  const [activeSection, setActiveSection] = useState('overview');

  const renderContent = () => {
    switch (activeSection) {
      case 'overview': return <HROverview />;
      case 'employees': return <HREmployeeDirectory />;
      case 'leave': return <HRLeaveManagement />;
      case 'payroll': return <HRPayroll />;
      case 'disciplinary': return <HRDisciplinary />;
      case 'audit': return <HRAudit />;
      default: return <HROverview />;
    }
  };

  return (
    <ExecutiveDashboardLayout
      role="hr"
      activeTab={activeSection}
      onTabChange={setActiveSection}
    >
      {renderContent()}
    </ExecutiveDashboardLayout>
  );
}
