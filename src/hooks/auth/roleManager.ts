import { supabase } from '@/integrations/supabase/client';
import { setCachedRoles } from '@/lib/sessionCache';
import type { AppRole } from './types';
import { getPreferredDefaultRole } from '@/hooks/useAppPreferences';

export const DEFAULT_ROLE: AppRole = 'supporter';
export const DEFAULT_ROLES: AppRole[] = ['supporter'];

/** Standard roles every user should have */
const STANDARD_ROLES: AppRole[] = ['supporter', 'agent', 'tenant', 'landlord'];

/** Fetch roles from DB, always ensuring 'agent' is included. Auto-creates roles if missing. */
export async function fetchUserRoles(
  userId: string,
  currentRole: AppRole | null,
  setRoles: (r: AppRole[]) => void,
  setRole: (r: AppRole) => void,
) {
  try {
    // First verify the user still exists (prevents re-provisioning deleted accounts)
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      console.warn('[RoleManager] User no longer exists or session invalid, skipping role provisioning');
      setRoles([]);
      setRole(null as unknown as AppRole);
      setCachedRoles([]);
      return;
    }

    // Fetch ALL roles (including disabled) to prevent re-provisioning
    const { data: allRolesData, error: allError } = await supabase
      .from('user_roles')
      .select('role, enabled')
      .eq('user_id', userId);

    if (allError) {
      console.warn('[RoleManager] Error fetching roles:', allError.message);
      setRoles(DEFAULT_ROLES);
      setRole(DEFAULT_ROLE);
      setCachedRoles(DEFAULT_ROLES);
      return;
    }

    // Filter to only enabled roles for display
    const data = (allRolesData || []).filter(r => r.enabled === null || r.enabled === true);
    const hasAnyRolesInDb = (allRolesData || []).length > 0;

    if (data && data.length > 0) {
      const userRoles = data.map(r => r.role as AppRole);
      // Note: link-onboarded users now receive all 4 public roles at activation,
      // so we no longer special-case supporter-only accounts here.
      if (!userRoles.includes('agent')) {
        userRoles.unshift('agent');
      }
      setRoles(userRoles);
      setCachedRoles(userRoles);
      
      // Check user's preferred default role first, then last-used role
      const preferred = getPreferredDefaultRole();
      const intendedRole = authUser?.user_metadata?.intended_role as AppRole | undefined;
      let lastUsedRole: AppRole | null = null;
      try { lastUsedRole = localStorage.getItem('welile_last_role') as AppRole | null; } catch {}
      const defaultForUser = 
        (preferred !== 'auto' && userRoles.includes(preferred as AppRole)) ? preferred as AppRole
        : (lastUsedRole && userRoles.includes(lastUsedRole)) ? lastUsedRole
        : (intendedRole && userRoles.includes(intendedRole)) ? intendedRole
        : userRoles[0];
      if (!currentRole || !userRoles.includes(currentRole)) {
        setRole(defaultForUser);
      }
    } else if (!hasAnyRolesInDb) {
      // Only auto-provision if user has NO roles at all in DB (not even disabled ones)
      // If profile doesn't exist, the user is being deleted — do NOT re-provision
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (!profile) {
        console.warn('[RoleManager] No profile found for user, account likely deleted. Skipping auto-provisioning.');
        setRoles([]);
        setRole(null as unknown as AppRole);
        setCachedRoles([]);
        return;
      }

      console.log('[RoleManager] No roles found, checking user metadata for:', userId);
      
      const intendedRole = authUser?.user_metadata?.intended_role;
      
      // Single-role provisioning: assign only the intended role
      const validSingleRoles: AppRole[] = ['tenant', 'agent', 'landlord', 'supporter'];
      const rolesToCreate: AppRole[] = (intendedRole && validSingleRoles.includes(intendedRole as AppRole))
        ? [intendedRole as AppRole]
        : STANDARD_ROLES; // Backwards compat: no intended_role → all 4
      
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
    } else {
      // All roles exist but are disabled — user has been fully restricted
      console.warn('[RoleManager] All roles disabled for user:', userId);
      setRoles([]);
      setRole(null as unknown as AppRole);
      setCachedRoles([]);
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

  // Try to re-enable an existing disabled role first
  const { data: existing } = await supabase
    .from('user_roles')
    .select('id, enabled')
    .eq('user_id', userId)
    .eq('role', newRole)
    .maybeSingle();

  let error;
  if (existing) {
    // Role exists but is disabled — re-enable it
    ({ error } = await supabase
      .from('user_roles')
      .update({ enabled: true })
      .eq('id', existing.id));
  } else {
    // Brand new role
    ({ error } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: newRole, enabled: true }));
  }

  if (!error) {
    const updated = [...currentRoles, newRole];
    setRoles(updated);
    if (!currentRole) setRole(newRole);
  }
  return { error: error as Error | null };
}
