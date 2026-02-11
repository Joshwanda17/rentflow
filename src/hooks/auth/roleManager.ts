import { supabase } from '@/integrations/supabase/client';
import { setCachedRoles } from '@/lib/sessionCache';
import type { AppRole } from './types';

export const DEFAULT_ROLE: AppRole = 'agent';
export const DEFAULT_ROLES: AppRole[] = ['agent'];

/** Fetch roles from DB, always ensuring 'agent' is included. */
export async function fetchUserRoles(
  userId: string,
  currentRole: AppRole | null,
  setRoles: (r: AppRole[]) => void,
  setRole: (r: AppRole) => void,
) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, enabled')
    .eq('user_id', userId)
    .or('enabled.is.null,enabled.eq.true');

  if (!error && data && data.length > 0) {
    let userRoles = data.map(r => r.role as AppRole);
    if (!userRoles.includes('agent')) {
      userRoles = ['agent', ...userRoles];
    }
    setRoles(userRoles);
    setCachedRoles(userRoles);
    if (!currentRole || !userRoles.includes(currentRole)) {
      setRole('agent');
    }
  } else {
    setRoles(DEFAULT_ROLES);
    setRole(DEFAULT_ROLE);
    setCachedRoles(DEFAULT_ROLES);
  }
}

/** Add a new role for the current user. */
export async function addRoleForUser(
  userId: string,
  newRole: AppRole,
  currentRoles: AppRole[],
  currentRole: AppRole | null,
  setRoles: (r: AppRole[]) => void,
  setRole: (r: AppRole) => void,
) {
  if (currentRoles.includes(newRole)) return { error: null };

  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role: newRole, enabled: true });

  if (!error) {
    const updated = [...currentRoles, newRole];
    setRoles(updated);
    if (!currentRole) setRole(newRole);
  }
  return { error: error as Error | null };
}
