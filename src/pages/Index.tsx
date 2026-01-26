import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

export default function Index() {
  const { user, roles, loading } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Preserve referral params for faster flow
  const ref = searchParams.get('ref');
  const role = searchParams.get('role');

  // Prefetch critical routes while loading
  useEffect(() => {
    if (loading) {
      // Prefetch auth and dashboard for faster navigation
      const prefetchRoutes = ['/auth', '/dashboard', '/select-role'];
      prefetchRoutes.forEach(route => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = route;
        document.head.appendChild(link);
      });
    }
  }, [loading]);

  // Show minimal loading - just a quick flash
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
