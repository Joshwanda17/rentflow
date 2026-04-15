import { useState } from 'react';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';
import HROverview from '@/components/hr/HROverview';
import HREmployeeDirectory from '@/components/hr/HREmployeeDirectory';
import HRUserManagement from '@/components/hr/HRUserManagement';
import HRLeaveManagement from '@/components/hr/HRLeaveManagement';
import HRPayroll from '@/components/hr/HRPayroll';
import HRDisciplinary from '@/components/hr/HRDisciplinary';
import HRAudit from '@/components/hr/HRAudit';
import HRDepartments from '@/components/hr/HRDepartments';
import HRInternshipApplications from '@/components/hr/HRInternshipApplications';

export default function HRDashboard() {
  const [activeSection, setActiveSection] = useState('overview');

  const renderContent = () => {
    switch (activeSection) {
      case 'overview': return <HROverview onNavigate={setActiveSection} />;
      case 'employees': return <HREmployeeDirectory />;
      case 'user-management': return <HRUserManagement />;
      case 'leave': return <HRLeaveManagement />;
      case 'payroll': return <HRPayroll />;
      case 'disciplinary': return <HRDisciplinary />;
      case 'audit': return <HRAudit />;
      case 'departments': return <HRDepartments />;
      case 'internships': return <HRInternshipApplications />;
      default: return <HROverview onNavigate={setActiveSection} />;
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