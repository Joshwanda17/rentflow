import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import TenantDashboard from '@/components/dashboards/TenantDashboard';
import AgentDashboard from '@/components/dashboards/AgentDashboard';
import SupporterDashboard from '@/components/dashboards/SupporterDashboard';
import LandlordDashboard from '@/components/dashboards/LandlordDashboard';
import ManagerDashboard from '@/components/dashboards/ManagerDashboard';
import { Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !role) {
    return null;
  }

  const dashboardProps = { user, signOut };

  switch (role) {
    case 'tenant':
      return <TenantDashboard {...dashboardProps} />;
    case 'agent':
      return <AgentDashboard {...dashboardProps} />;
    case 'supporter':
      return <SupporterDashboard {...dashboardProps} />;
    case 'landlord':
      return <LandlordDashboard {...dashboardProps} />;
    case 'manager':
      return <ManagerDashboard {...dashboardProps} />;
    default:
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p>Unknown role. Please contact support.</p>
        </div>
      );
  }
}
