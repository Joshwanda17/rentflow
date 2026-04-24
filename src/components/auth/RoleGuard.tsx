import { ReactNode, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type AppRole } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface RoleGuardProps {
  allowedRoles: AppRole[];
  children: ReactNode;
  redirectTo?: string;
}

export default function RoleGuard({ allowedRoles, children, redirectTo = '/dashboard/tenant' }: RoleGuardProps) {
  const { user, roles, loading } = useAuth();
  const loggedRef = useRef(false);

  const hasAccess = roles.some(r => allowedRoles.includes(r));

  // Log unauthorized access attempts
  useEffect(() => {
    if (loading || !user || hasAccess || loggedRef.current) return;
    loggedRef.current = true;

    supabase.from('audit_logs').insert({
      user_id: user.id,
      action_type: 'unauthorized_access_attempt',
      metadata: {
        attempted_roles: allowedRoles,
        user_roles: roles,
        path: window.location.pathname,
        timestamp: new Date().toISOString(),
      },
    });
  }, [loading, user, hasAccess, allowedRoles, roles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!hasAccess) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
