import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { roleToSlug } from '@/lib/roleRoutes';
import DashboardLoadingFallback from '@/components/DashboardLoadingFallback';

/**
 * Catch-all redirect for the legacy `/dashboard` URL.
 *
 * Old home-screen icons, stale SMS/email links, and bookmarks may still hit
 * the bare `/dashboard` path. Resolve the user's primary role and forward
 * them to the correct `/dashboard/{role}` slug, preserving any `?role=` hint
 * in the original URL.
 */
export default function DashboardRedirect() {
  const { user, role, roles, loading } = useAuth();
  const navigate = useNavigate();

  // Allow `?role=agent` style hints to win over the default role.
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const hint = params?.get('role');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }
    if (hint && roles.includes(hint as typeof roles[number])) {
      navigate(roleToSlug(hint as typeof roles[number]), { replace: true });
      return;
    }
    const target = role ?? roles[0] ?? null;
    if (target) {
      navigate(roleToSlug(target), { replace: true });
    } else {
      navigate('/select-role', { replace: true });
    }
  }, [loading, user, role, roles, hint, navigate]);

  // While auth resolves, show the same skeleton the dashboard uses so
  // there is no flash of empty content.
  if (!loading && !user) return <Navigate to="/auth" replace />;
  return <DashboardLoadingFallback />;
}
