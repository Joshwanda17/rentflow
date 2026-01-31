import { useEffect, useState, Suspense, lazy, memo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/useAuth';
import AddRoleDialog from '@/components/AddRoleDialog';
import FloatingChatButton from '@/components/chat/FloatingChatButton';
import { PushNotificationEnforcer } from '@/components/PushNotificationEnforcer';
import { FloatingWalletButton } from '@/components/wallet/FloatingWalletButton';
import { Loader2, WifiOff, RefreshCw } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { getCachedUserRoles, cacheUserRoles } from '@/lib/offlineDataStorage';
import { getPreloadedRoles } from '@/lib/sessionCache';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useConfetti } from '@/components/Confetti';
import { Button } from '@/components/ui/button';
import { LocationPermissionGate } from '@/components/LocationPermissionGate';

// Lazy load dashboards for faster initial load
const TenantDashboard = lazy(() => import('@/components/dashboards/TenantDashboard'));
const AgentDashboard = lazy(() => import('@/components/dashboards/AgentDashboard'));
const SupporterDashboard = lazy(() => import('@/components/dashboards/SupporterDashboard'));
const LandlordDashboard = lazy(() => import('@/components/dashboards/LandlordDashboard'));
const ManagerDashboard = lazy(() => import('@/components/dashboards/ManagerDashboard'));

// Minimal loading skeleton - memoized for performance
const DashboardLoadingFallback = memo(() => (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-4">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
    <p className="text-xs text-muted-foreground">Loading...</p>
  </div>
));
DashboardLoadingFallback.displayName = 'DashboardLoadingFallback';

// Offline fallback when dashboard can't load
const OfflineFallback = ({ cachedRole, onRetry }: { cachedRole?: AppRole | null; onRetry: () => void }) => (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
    <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center">
      <WifiOff className="h-8 w-8 text-warning" />
    </div>
    <div className="text-center space-y-2 max-w-sm">
      <h1 className="text-xl font-semibold">You're Offline</h1>
      <p className="text-muted-foreground text-sm">
        {cachedRole 
          ? `Your ${cachedRole} dashboard will load with cached data when connection is restored.`
          : 'Please check your internet connection and try again.'
        }
      </p>
    </div>
    <Button onClick={onRetry} className="gap-2">
      <RefreshCw className="h-4 w-4" />
      Retry Connection
    </Button>
    <p className="text-xs text-muted-foreground/60 text-center mt-4">
      The app works best with an internet connection, but cached data is available when offline.
    </p>
  </div>
);

function DashboardContent() {
  const { user, role, roles, loading, signOut, switchRole, addRole } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // INSTANT: Use preloaded session cache for immediate display
  const preloadedRoles = getPreloadedRoles() as AppRole[] | null;
  const [cachedRoles, setCachedRoles] = useState<AppRole[]>(preloadedRoles || []);
  const [showCachedUI, setShowCachedUI] = useState(!!preloadedRoles?.length);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();
  
  // Enable real-time notifications for money transfers and requests
  useNotifications();

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

  // Use cached role for instant display while loading - AGENT is always the default
  const getDefaultRole = (availableRoles: AppRole[]): AppRole | null => {
    if (availableRoles.length === 0) return null;
    // Agent dashboard is the default for all users
    return availableRoles.includes('agent') ? 'agent' : availableRoles[0];
  };
  
  const displayRole = role || (showCachedUI && cachedRoles.length > 0 ? getDefaultRole(cachedRoles) : null);
  const displayRoles = roles.length > 0 ? roles : cachedRoles;

// Allow dashboards to render with cached data when offline
  // Only show offline fallback if we have no cached roles at all
  if (loading && !showCachedUI && !isOnline && cachedRoles.length === 0) {
    return <OfflineFallback cachedRole={null} onRetry={() => window.location.reload()} />;
  }

  // If loading but offline with cached roles, skip loading and show cached UI
  if (loading && !isOnline && cachedRoles.length > 0) {
    // Use cached roles directly
    const cachedDisplayRole = cachedRoles[0];
    const dashboardProps = { 
      user: user!, 
      signOut, 
      currentRole: cachedDisplayRole, 
      availableRoles: cachedRoles, 
      onRoleChange: switchRole,
      addRoleComponent: <AddRoleDialog availableRoles={cachedRoles} onAddRole={addRole} />
    };

    return (
      <>
        <Suspense fallback={<DashboardLoadingFallback />}>
          {cachedDisplayRole === 'tenant' && <TenantDashboard {...dashboardProps} />}
          {cachedDisplayRole === 'agent' && <AgentDashboard {...dashboardProps} />}
          {cachedDisplayRole === 'supporter' && <SupporterDashboard {...dashboardProps} />}
          {cachedDisplayRole === 'landlord' && <LandlordDashboard {...dashboardProps} />}
          {cachedDisplayRole === 'manager' && <ManagerDashboard {...dashboardProps} />}
        </Suspense>
        <FloatingWalletButton />
        <FloatingChatButton />
      </>
    );
  }

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
      <FloatingWalletButton />
      <FloatingChatButton />
      <PushNotificationEnforcer />
    </>
  );
}

// Main Dashboard component with Location Gate
export default function Dashboard() {
  return (
    <LocationPermissionGate>
      <DashboardContent />
    </LocationPermissionGate>
  );
}
