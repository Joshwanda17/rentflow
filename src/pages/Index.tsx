import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { getCachedSession, getCachedRoles } from '@/lib/sessionCache';

export default function Index() {
  const { user, roles, loading } = useAuth();
  const [searchParams] = useSearchParams();
  
  const ref = searchParams.get('ref');
  const role = searchParams.get('role');

  // Wait for auth to finish loading before making any redirect decision
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Auth finished loading — use LIVE auth state, not stale cache
  if (user) {
    if (roles.length > 0) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/select-role" replace />;
  }

  // Not logged in — check referral links
  if (ref || role) {
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    if (role) params.set('role', role);
    const queryString = params.toString();
    return <Navigate to={queryString ? `/auth?${queryString}` : '/auth'} replace />;
  }

  // Regular visit
  return <Navigate to="/welcome" replace />;
}
