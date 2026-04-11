import { useEffect, useState, useCallback, useRef, Suspense, lazy, memo } from 'react';

import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import AddRoleDialog from '@/components/AddRoleDialog';
import BottomRoleSwitcher from '@/components/BottomRoleSwitcher';
// FloatingChatButton removed — chat accessible only via nav

import { ISOLATED_ROLES, roleDashboardRoutes } from '@/components/layout/executiveSidebarConfig';

import { Loader2, WifiOff, RefreshCw, ShieldAlert } from 'lucide-react';

import { getCachedUserRoles, cacheUserRoles } from '@/lib/offlineDataStorage';
import { getPreloadedRoles } from '@/lib/sessionCache';
import { getPreferredDefaultRole, areAllRolesUnlocked } from '@/hooks/useAppPreferences';
import { useDeployedCapital } from '@/hooks/useDeployedCapital';
import { useToast } from '@/hooks/use-toast';
import { useConfetti } from '@/components/Confetti';
import { Button } from '@/components/ui/button';
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
  const { user, role, roles, loading, signOut, switchRole, addRole, grantAndSwitchRole } = useAuth();
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null);

  // Clear pendingRole when the active role matches it
  useEffect(() => {
    if (pendingRole && role === pendingRole) {
      setPendingRole(null);
    }
  }, [role, pendingRole]);

  const handlePublicRoleSwitch = useCallback(async (newRole: AppRole) => {
    if (newRole === role && !pendingRole) return;
    if (pendingRole) return; // Already switching, ignore taps
    
    const publicRoles: AppRole[] = ['tenant', 'agent', 'landlord', 'supporter'];
    if (!publicRoles.includes(newRole) && !roles.includes(newRole)) {
      return; // Non-public role they don't have — block
    }

    setPendingRole(newRole);

    if (publicRoles.includes(newRole)) {
      // Use atomic grant-and-switch to avoid race condition
      const { error } = await grantAndSwitchRole(newRole);
      if (error) {
        console.warn('[Dashboard] Failed to switch role:', error.message);
        setPendingRole(null);
        return;
      }
    } else {
      switchRole(newRole);
    }
  }, [role, roles, pendingRole, switchRole, grantAndSwitchRole]);

  const { profile } = useProfile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // INSTANT: Use preloaded session cache for immediate display
  const preloadedRoles = getPreloadedRoles() as AppRole[] | null;
  const [cachedRoles, setCachedRoles] = useState<AppRole[]>(preloadedRoles || []);
  const [showCachedUI, setShowCachedUI] = useState(!!preloadedRoles?.length);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();
  const { isQualifiedInvestor } = useDeployedCapital(user?.id);

  // Derive frozen state from profile (no separate DB call)
  const isFrozen = profile?.is_frozen ?? false;
  const frozenReason = profile?.frozen_reason || 'Your account has been frozen for violating platform policies.';
  

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

  // Auto-default qualified investors (≥100K deployed) to Funder dashboard on INITIAL load only
  const hasAutoDefaulted = useRef(false);
  useEffect(() => {
    if (loading || !user || roles.length === 0) return;
    if (hasAutoDefaulted.current) return; // Only auto-default once per session
    if (!isQualifiedInvestor) return;
    if (areAllRolesUnlocked()) return;
    const preferred = getPreferredDefaultRole();
    if (preferred !== 'auto') return;
    if (role !== 'supporter' && roles.includes('supporter')) {
      switchRole('supporter');
    }
    hasAutoDefaulted.current = true;
  }, [loading, user, roles, role, isQualifiedInvestor, switchRole]);

  // Handle role switch via URL param (e.g. after tenant/supporter activation)
  // Gate on !loading && roles.length > 0 to prevent race with fetchUserRoles
  useEffect(() => {
    if (loading || roles.length === 0 || !user) return;
    const requestedRole = searchParams.get('role') as AppRole | null;
    if (!requestedRole) return;
    const validRoles: AppRole[] = ['tenant', 'agent', 'landlord', 'supporter', 'manager'];
    if (validRoles.includes(requestedRole) && roles.includes(requestedRole)) {
      switchRole(requestedRole);
    }
    searchParams.delete('role');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, user, loading, roles, switchRole, setSearchParams]);

  // Redirect executive/internal roles to their isolated dashboards
  useEffect(() => {
    if (!user || loading || !role) return;
    if (ISOLATED_ROLES.includes(role)) {
      const route = roleDashboardRoutes[role];
      if (route) {
        navigate(route, { replace: true });
      }
    }
  }, [user, loading, role, navigate]);

   // Handle investment account activation via link (investment_accounts table removed)
  useEffect(() => {
    const activateAccountId = searchParams.get('activate_account');
    if (!activateAccountId || !user) return;

    // investment_accounts table removed - just clear the param
    searchParams.delete('activate_account');
    setSearchParams(searchParams, { replace: true });
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

  // Safety redirect: wait briefly for roles to arrive before redirecting
  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    // Roles may still be loading asynchronously after auth loading finishes.
    // Wait 1.5s before concluding user has no roles to prevent flash redirect.
    if (user && roles.length === 0 && cachedRoles.length === 0) {
      const timeout = setTimeout(() => {
        // Re-check: roles may have arrived during the wait
        if (roles.length === 0 && cachedRoles.length === 0) {
          navigate('/select-role', { replace: true });
        }
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [user, loading, roles, cachedRoles, navigate]);

  // Use cached role for instant display while loading
  const getDefaultRole = (availableRoles: AppRole[]): AppRole | null => {
    if (availableRoles.length === 0) return null;
    // Check user's preferred default role
    const preferred = getPreferredDefaultRole();
    if (preferred !== 'auto' && availableRoles.includes(preferred as AppRole)) return preferred as AppRole;
    // Fallback to supporter
    if (availableRoles.includes('supporter')) return 'supporter';
    return availableRoles[0];
  };
  
  const displayRole = role || (showCachedUI && cachedRoles.length > 0 ? getDefaultRole(cachedRoles) : null);
  const displayRoles = roles.length > 0 ? roles : cachedRoles;

  // 🚫 FROZEN ACCOUNT - Block all access
  if (isFrozen) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
            <ShieldAlert className="h-10 w-10 text-destructive" />
          </div>
          <div className="bg-destructive/10 border-2 border-destructive rounded-xl p-6 space-y-3">
            <h1 className="text-xl font-bold text-destructive">🚫 Account Frozen</h1>
            <p className="text-destructive font-medium text-sm leading-relaxed">
              {frozenReason}
            </p>
          </div>
          <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-destructive">⚠️ All transactions are blocked</p>
            <p className="text-xs text-muted-foreground">
              Deposits, withdrawals, transfers, and all other operations have been suspended pending investigation.
            </p>
          </div>
          <div className="bg-card border rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium">Need help? Contact Support on WhatsApp</p>
            <a href="https://wa.me/256708257899" target="_blank" rel="noopener noreferrer" className="block text-lg font-bold text-green-600 underline">
              💬 0708 257 899
            </a>
            <p className="text-xs text-muted-foreground">
              WhatsApp only
            </p>
          </div>
          <button
            onClick={() => signOut()}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

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
      </>
    );
  }

  if ((loading && !showCachedUI) || pendingRole) {
    return (
      <>
        <DashboardLoadingFallback />
        {/* Keep bottom nav visible during transition for continuity */}
        {pendingRole && displayRole && ['tenant', 'agent', 'landlord', 'supporter'].includes(pendingRole) && (
          <BottomRoleSwitcher currentRole={pendingRole} onRoleChange={handlePublicRoleSwitch} />
        )}
      </>
    );
  }

  // If no user and not loading, the redirect effect above will handle it.
  // Show loading fallback briefly while redirect kicks in.
  if (!user || !displayRole) {
    return <DashboardLoadingFallback />;
  }

  const isPublicRole = ['tenant', 'agent', 'landlord', 'supporter'].includes(displayRole);

  const dashboardProps = { 
    user, 
    signOut, 
    currentRole: displayRole, 
    availableRoles: displayRoles, 
    onRoleChange: handlePublicRoleSwitch,
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
      {isPublicRole && (
        <BottomRoleSwitcher currentRole={displayRole} onRoleChange={handlePublicRoleSwitch} />
      )}
    </>
  );
}

// Main Dashboard component — LocationPermissionGate removed (was a passthrough)
export default function Dashboard() {
  return <DashboardContent />;
}
