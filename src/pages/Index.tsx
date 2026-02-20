import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const { user, roles, loading } = useAuth();
  const [searchParams] = useSearchParams();
  
  const ref = searchParams.get('ref');
  const role = searchParams.get('role');

  // While auth is loading: show spinner before making any redirect decision
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Auth finished loading — use LIVE auth state
  if (user) {
    // Already logged in — skip auth form even if referral/role params present
    if (roles.length > 0) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/select-role" replace />;
  }

  // Not logged in — send referral/role links to auth
  if (ref || role) {
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    if (role) params.set('role', role);
    return <Navigate to={`/auth?${params.toString()}`} replace />;
  }

  return <Navigate to="/welcome" replace />;
}
