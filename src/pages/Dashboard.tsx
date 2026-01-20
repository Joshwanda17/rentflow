import { useEffect, useState, Suspense, lazy } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/useAuth';
import AddRoleDialog from '@/components/AddRoleDialog';
import FloatingChatButton from '@/components/chat/FloatingChatButton';
import { PushNotificationPrompt } from '@/components/PushNotificationPrompt';
import { Loader2 } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { getCachedUserRoles, cacheUserRoles } from '@/lib/offlineDataStorage';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useConfetti } from '@/components/Confetti';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [cachedRoles, setCachedRoles] = useState<AppRole[]>([]);
  const [showCachedUI, setShowCachedUI] = useState(false);
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();
  
  // Enable real-time notifications for money transfers and requests
  useNotifications();

  // Handle investment account activation via link
  useEffect(() => {
    const activateAccountId = searchParams.get('activate_account');
    if (!activateAccountId || !user) return;

    const activateAccount = async () => {
      // Verify this account belongs to the current user and is pending_activation
      const { data: account, error: fetchError } = await supabase
        .from('investment_accounts')
        .select('*')
        .eq('id', activateAccountId)
        .eq('user_id', user.id)
        .eq('status', 'pending_activation')
        .single();

      if (fetchError || !account) {
        if (fetchError?.code !== 'PGRST116') {
          console.warn('[Dashboard] Account activation error:', fetchError);
        }
        // Clear the param to prevent repeated attempts
        searchParams.delete('activate_account');
        setSearchParams(searchParams, { replace: true });
        return;
      }

      // Activate the account
      const { error: updateError } = await supabase
        .from('investment_accounts')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString()
        })
        .eq('id', activateAccountId);

      if (updateError) {
        toast({ 
          title: 'Activation Failed', 
          description: updateError.message, 
          variant: 'destructive' 
        });
      } else {
        fireSuccess();
        toast({ 
          title: '🎉 Account Activated!', 
          description: `Your investment account "${account.name}" is now active. Start investing!` 
        });
      }

      // Clear the activation param
      searchParams.delete('activate_account');
      setSearchParams(searchParams, { replace: true });
    };

    activateAccount();
  }, [searchParams, user, toast, fireSuccess, setSearchParams]);

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
