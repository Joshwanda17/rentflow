import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { roleToSlug, slugToRole } from '@/lib/roleRoutes';
import { getPreferredDefaultRole } from '@/hooks/useAppPreferences';
import { Loader2 } from 'lucide-react';

/**
 * Catch-all redirect for the legacy `/dashboard` URL.
 *
 * Old home-screen icons, stale SMS/email links, and bookmarks may still hit
 * the bare `/dashboard` path — and users may have lost a role since the link
 * was created. We resolve the *currently held* role and forward to the
 * matching `/dashboard/{role}` slug. Any requested role we cannot honour
 * (stale `auth.role`, expired `?role=` hint, or a `/dashboard/<bad-slug>`
 * URL the user no longer has access to) falls through to `/select-role`
 * rather than landing on a broken persona screen.
 */
export default function DashboardRedirect() {
  const { user, role, roles, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Allow `?role=agent` style hints AND `/dashboard/<slug>` path hints
  // to override the cached default role — but only if the user still
  // holds that role.
  const queryHint = new URLSearchParams(location.search).get('role') as AppRole | null;
  const pathHint = slugToRole(location.pathname); // null for bare `/dashboard`

  // Detect `/dashboard/<unknown-slug>` so we can route those users to the
  // role picker rather than silently dropping them on their default
  // dashboard. A bare `/dashboard` (no second segment) is NOT considered
  // unknown — it's the legacy entry point and should fall through.
  const segments = location.pathname.split('/').filter(Boolean);
  const hasUnknownPathSlug =
    segments[0] === 'dashboard' && segments.length > 1 && pathHint === null;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/auth', { replace: true });
      return;
    }

    // No roles at all → onboarding picker. This is the lost-roles case.
    if (roles.length === 0) {
      navigate('/select-role', { replace: true, state: { reason: 'no-roles' } });
      return;
    }

    // Pick the first hint the user actually still holds.
    // Priority: explicit URL/query hint → user's chosen default → cached auth.role.
    const preferred = getPreferredDefaultRole();
    const preferredRole: AppRole | null =
      preferred !== 'auto' ? (preferred as AppRole) : null;
    const candidates: Array<AppRole | null> = [pathHint, queryHint, preferredRole, role];
    const honored = candidates.find((c): c is AppRole => !!c && roles.includes(c));
    if (honored) {
      navigate(roleToSlug(honored), { replace: true });
      return;
    }

    // A specific persona was requested but the user no longer has it
    // (revoked access, expired link) OR the URL contains an unknown
    // persona slug like `/dashboard/foo`. Send them to the role picker
    // so they can choose from what they DO have, instead of landing on
    // a broken dashboard screen.
    if (pathHint || queryHint || hasUnknownPathSlug) {
      const requestedSlug = hasUnknownPathSlug
        ? location.pathname
        : queryHint
          ? `/dashboard/${queryHint === 'supporter' ? 'funder' : queryHint}`
          : location.pathname;
      navigate('/select-role', {
        replace: true,
        state: {
          reason: hasUnknownPathSlug ? 'unknown-slug' : 'role-not-held',
          requestedSlug,
        },
      });
      return;
    }

    // Bare `/dashboard` with no hint: forward to the first available role.
    navigate(roleToSlug(roles[0]), { replace: true });
  }, [loading, user, role, roles, pathHint, queryHint, hasUnknownPathSlug, navigate]);

  // While auth resolves, show the same skeleton the dashboard uses so
  // there is no flash of empty content.
  if (!loading && !user) return <Navigate to="/auth" replace />;
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
