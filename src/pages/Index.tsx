import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function Index() {
  const { user, roles, loading } = useAuth();
  const [searchParams] = useSearchParams();
  
  const ref = searchParams.get('ref');
  const role = searchParams.get('role');

  // Check referral links FIRST — these must always go to /auth regardless of auth state
  if (ref || role) {
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    if (role) params.set('role', role);
    const queryString = params.toString();
    return <Navigate to={queryString ? `/auth?${queryString}` : '/auth'} replace />;
  }

  // While auth is loading: ALWAYS show spinner — never redirect to /welcome
  // This prevents signed-in users from being kicked out on refresh/update
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Auth finished loading — use LIVE auth state
  if (user) {
    if (roles.length > 0) {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/select-role" replace />;
  }

  // Not logged in
  return <Navigate to="/welcome" replace />;
}
