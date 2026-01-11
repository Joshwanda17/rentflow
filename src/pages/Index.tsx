import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function Index() {
  const { user, roles, loading } = useAuth();

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user is logged in
  if (user) {
    // If they have roles, go to dashboard
    if (roles.length > 0) {
      return <Navigate to="/dashboard" replace />;
    }
    // If they don't have roles yet, let them select
    return <Navigate to="/select-role" replace />;
  }

  // Not logged in - go to auth page
  return <Navigate to="/auth" replace />;
}
