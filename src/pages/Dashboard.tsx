import { useEffect, useState, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/useAuth';
import AddRoleDialog from '@/components/AddRoleDialog';
import FloatingChatButton from '@/components/chat/FloatingChatButton';
import { PushNotificationPrompt } from '@/components/PushNotificationPrompt';
import { Loader2 } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { getCachedUserRoles, cacheUserRoles } from '@/lib/offlineDataStorage';

// Lazy load dashboards for faster initial load
const TenantDashboard = lazy(() => import('@/components/dashboards/TenantDashboard'));
const AgentDashboard = lazy(() => import('@/components/dashboards/AgentDashboard'));
const SupporterDashboard = lazy(() => import('@/components/dashboards/SupporterDashboard'));
const LandlordDashboard = lazy(() => import('@/components/dashboards/LandlordDashboard'));
const ManagerDashboard = lazy(() => import('@/components/dashboards/ManagerDashboard'));

// Minimal loading skeleton for faster perceived loading
const DashboardLoadingFallback = () => (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-4">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
    <p className="text-sm text-muted-foreground">Loading dashboard...</p>
  </div>
);

export default function Dashboard() {
  const { user, role, roles, loading, signOut, switchRole, addRole } = useAuth();
  const navigate = useNavigate();
  const [cachedRoles, setCachedRoles] = useState<AppRole[]>([]);
  const [showCachedUI, setShowCachedUI] = useState(false);
  
  // Enable real-time notifications for money transfers and requests
  useNotifications();

  // Try to load cached roles for instant display
  useEffect(() => {
    const loadCachedRoles = async () => {
      if (user && roles.length === 0 && loading) {
        try {
          const cached = await getCachedUserRoles(user.id);
          if (cached.length > 0) {
            setCachedRoles(cached as AppRole[]);
            setShowCachedUI(true);
          }
        } catch (e) {
          console.warn('[Dashboard] Failed to load cached roles:', e);
        }
      }
    };
    loadCachedRoles();
  }, [user, roles, loading]);

  // Cache roles when loaded
  useEffect(() => {
    if (user && roles.length > 0) {
      cacheUserRoles(user.id, roles).catch(console.warn);
      setShowCachedUI(false);
    }
  }, [user, roles]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    } else if (!loading && user && roles.length === 0 && cachedRoles.length === 0) {
      navigate('/select-role');
    }
  }, [user, loading, roles, cachedRoles, navigate]);

  // Use cached role for instant display while loading
  const displayRole = role || (showCachedUI && cachedRoles.length > 0 ? cachedRoles[0] : null);
  const displayRoles = roles.length > 0 ? roles : cachedRoles;

  if (loading && !showCachedUI) {
    return <DashboardLoadingFallback />;
  }

  if (!user || !displayRole) {
    return null;
  }

  const dashboardProps = { 
    user, 
    signOut, 
    currentRole: displayRole, 
    availableRoles: displayRoles, 
    onRoleChange: switchRole,
    addRoleComponent: <AddRoleDialog availableRoles={displayRoles} onAddRole={addRole} />
  };

  const renderDashboard = () => {
    switch (displayRole) {
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
      <Suspense fallback={<DashboardLoadingFallback />}>
        {renderDashboard()}
      </Suspense>
      <FloatingChatButton />
      <PushNotificationPrompt />
    </>
  );
}
