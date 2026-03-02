import { supabase } from '@/integrations/supabase/client';
import { setCachedRoles } from '@/lib/sessionCache';
import type { AppRole } from './types';

export const DEFAULT_ROLE: AppRole = 'agent';
export const DEFAULT_ROLES: AppRole[] = ['agent'];

/** Standard roles every user should have */
const STANDARD_ROLES: AppRole[] = ['agent', 'tenant', 'supporter', 'landlord'];

/** Fetch roles from DB, always ensuring 'agent' is included. Auto-creates roles if missing. */
export async function fetchUserRoles(
  userId: string,
  currentRole: AppRole | null,
  setRoles: (r: AppRole[]) => void,
  setRole: (r: AppRole) => void,
) {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role, enabled')
      .eq('user_id', userId)
      .or('enabled.is.null,enabled.eq.true');

    if (error) {
      console.warn('[RoleManager] Error fetching roles:', error.message);
      setRoles(DEFAULT_ROLES);
      setRole(DEFAULT_ROLE);
      setCachedRoles(DEFAULT_ROLES);
      return;
    }

    if (data && data.length > 0) {
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
      // No roles found — auto-create standard roles for this user
      console.log('[RoleManager] No roles found, auto-creating for user:', userId);
      const inserts = STANDARD_ROLES.map(role => ({
        user_id: userId,
        role,
        enabled: true,
      }));
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert(inserts);

      if (!insertError) {
        setRoles(STANDARD_ROLES);
        setCachedRoles(STANDARD_ROLES);
        if (!currentRole || !STANDARD_ROLES.includes(currentRole)) {
          setRole('agent');
        }
      } else {
        console.warn('[RoleManager] Failed to auto-create roles:', insertError.message);
        setRoles(DEFAULT_ROLES);
        setRole(DEFAULT_ROLE);
        setCachedRoles(DEFAULT_ROLES);
      }
    }
  } catch (err: any) {
    console.warn('[RoleManager] Exception fetching roles:', err?.message);
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
