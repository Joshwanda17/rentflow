import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { AppRole } from '@/hooks/auth/types';

const BYPASS_ROLES: AppRole[] = ['super_admin', 'cto'];

export function useStaffPermissions() {
  const { user, roles, loading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const isBypassed = roles.some(r => BYPASS_ROLES.includes(r));

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    if (isBypassed) {
      // super_admin and cto bypass — they have access to everything
      setPermissions(['*']);
      setLoading(false);
      return;
    }

    // Also include dashboards matching the user's own roles
    // e.g. a user with 'ceo' role can always access 'ceo' dashboard
    const roleDashboards = roles.filter(r => ['ceo', 'coo', 'cfo', 'cto', 'cmo', 'crm'].includes(r));

    const fetchPermissions = async () => {
      const { data } = await supabase
        .from('staff_permissions')
        .select('permitted_dashboard')
        .eq('user_id', user.id);

      const granted = (data || []).map((p: any) => p.permitted_dashboard);
      setPermissions([...new Set([...roleDashboards, ...granted])]);
      setLoading(false);
    };

    fetchPermissions();
  }, [user, roles, authLoading, isBypassed]);

  const hasPermission = (dashboard: string): boolean => {
    if (isBypassed) return true;
    return permissions.includes(dashboard);
  };

  return { permissions, hasPermission, loading, isBypassed };
}
