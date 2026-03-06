import { supabase } from '@/integrations/supabase/client';
import { setCachedRoles } from '@/lib/sessionCache';
import type { AppRole } from './types';

export const DEFAULT_ROLE: AppRole = 'agent';
export const DEFAULT_ROLES: AppRole[] = ['agent'];

/** Standard roles every user should have */
const STANDARD_ROLES: AppRole[] = ['agent', 'tenant', 'landlord'];

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
      const userRoles = data.map(r => r.role as AppRole);
      // Supporter-only accounts: do NOT inject 'agent' role
      const isSupporterOnly = userRoles.length === 1 && userRoles[0] === 'supporter';
      if (!isSupporterOnly && !userRoles.includes('agent')) {
        userRoles.unshift('agent');
      }
      setRoles(userRoles);
      setCachedRoles(userRoles);
      const defaultForUser = isSupporterOnly ? 'supporter' : 'agent';
      if (!currentRole || !userRoles.includes(currentRole)) {
        setRole(defaultForUser as AppRole);
      }
    } else {
      // No roles found — check if this is a supporter account before auto-creating
      console.log('[RoleManager] No roles found, checking user metadata for:', userId);
      
      // Check if the user was registered as a supporter (via metadata)
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const intendedRole = authUser?.user_metadata?.intended_role;
      
      const rolesToCreate: AppRole[] = intendedRole === 'supporter' 
        ? ['supporter'] 
        : STANDARD_ROLES;
      
      const inserts = rolesToCreate.map(role => ({
        user_id: userId,
        role,
        enabled: true,
      }));
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert(inserts);

      if (!insertError) {
        setRoles(rolesToCreate);
        setCachedRoles(rolesToCreate);
        const defaultRole = intendedRole === 'supporter' ? 'supporter' : 'agent';
        if (!currentRole || !rolesToCreate.includes(currentRole as AppRole)) {
          setRole(defaultRole as AppRole);
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
