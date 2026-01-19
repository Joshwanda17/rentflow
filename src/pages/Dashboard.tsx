import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/useAuth';
import TenantDashboard from '@/components/dashboards/TenantDashboard';
import AgentDashboard from '@/components/dashboards/AgentDashboard';
import SupporterDashboard from '@/components/dashboards/SupporterDashboard';
import LandlordDashboard from '@/components/dashboards/LandlordDashboard';
import ManagerDashboard from '@/components/dashboards/ManagerDashboard';
import AddRoleDialog from '@/components/AddRoleDialog';
import FloatingChatButton from '@/components/chat/FloatingChatButton';
import { PushNotificationPrompt } from '@/components/PushNotificationPrompt';
import { Loader2 } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';

export default function Dashboard() {
  const { user, role, roles, loading, signOut, switchRole, addRole } = useAuth();
  const navigate = useNavigate();
  
  // Enable real-time notifications for money transfers and requests
  useNotifications();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    } else if (!loading && user && roles.length === 0) {
      navigate('/select-role');
    }
  }, [user, loading, roles, navigate]);

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

  const dashboardProps = { 
    user, 
    signOut, 
    currentRole: role, 
    availableRoles: roles, 
    onRoleChange: switchRole,
    addRoleComponent: <AddRoleDialog availableRoles={roles} onAddRole={addRole} />
  };

  const renderDashboard = () => {
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
  };

  return (
    <>
      {renderDashboard()}
      <FloatingChatButton />
      <PushNotificationPrompt />
    </>
  );
}
