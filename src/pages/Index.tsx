import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getPreloadedSession, getPreloadedRoles } from '@/lib/sessionCache';

export default function Index() {
  const { user, roles, loading } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Preserve referral params for faster flow
  const ref = searchParams.get('ref');
  const role = searchParams.get('role');

  // INSTANT: Use cached session for immediate redirect decision
  const cachedSession = getPreloadedSession();
  const cachedRoles = getPreloadedRoles();

  // If we have cached data, make instant decision without waiting
  if (cachedSession && cachedRoles && cachedRoles.length > 0) {
    return <Navigate to="/dashboard" replace />;
  }
  
  if (cachedSession && (!cachedRoles || cachedRoles.length === 0)) {
    return <Navigate to="/select-role" replace />;
  }

  // Fallback: Show minimal loading only if truly needed
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Build auth redirect with preserved params for referral links
  const buildAuthUrl = () => {
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    if (role) params.set('role', role);
    const queryString = params.toString();
    return queryString ? `/auth?${queryString}` : '/auth';
  };

  // If user is logged in
  if (user) {
    // If they have roles, go to dashboard immediately
    if (roles.length > 0) {
      return <Navigate to="/dashboard" replace />;
    }
    // If they don't have roles yet, let them select (or auto-assign if role param exists)
    return <Navigate to="/select-role" replace />;
  }

  // Not logged in - check if this is a referral link
  if (ref || role) {
    // Go directly to auth with params preserved
    return <Navigate to={buildAuthUrl()} replace />;
  }

  // Regular visit - go to landing page
  return <Navigate to="/welcome" replace />;
}
