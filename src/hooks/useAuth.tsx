import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  setCachedSession,
  clearSessionCache,
  clearAllAuthStorage,
  getPreloadedSession,
  getPreloadedRoles,
} from '@/lib/sessionCache';


// Re-export types so existing imports keep working
export type { AppRole } from './auth/types';
export type { AuthContextType } from './auth/types';

import type { AppRole, AuthContextType } from './auth/types';
import { DEFAULT_ROLES, fetchUserRoles, addRoleForUser } from './auth/roleManager';
import * as ops from './auth/authOperations';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedSession = getPreloadedSession();
  const cachedRoles = getPreloadedRoles() as AppRole[] | null;

  const isCachedSupporterOnly = cachedRoles?.length === 1 && cachedRoles[0] === 'supporter';
  const initialRoles: AppRole[] =
    cachedRoles && cachedRoles.length > 0
      ? cachedRoles.includes('supporter') ? cachedRoles : ['supporter', ...cachedRoles] as AppRole[]
      : DEFAULT_ROLES;

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(initialRoles.includes('supporter') ? 'supporter' : initialRoles[0]);
  const [roles, setRoles] = useState<AppRole[]>(initialRoles);
  const rolesRef = useRef<AppRole[]>(initialRoles);
  const [loading, setLoading] = useState(true);

  // Keep ref in sync with state
  const setRolesWithRef = (newRoles: AppRole[]) => {
    rolesRef.current = newRoles;
    setRoles(newRoles);
  };

  useEffect(() => {
    let isMounted = true;
    let rolesFetched = false; // prevent duplicate role fetches

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        // Only update session state if we actually have a session,
        // or if this is an explicit sign-out. This prevents transient
        // null sessions (e.g., during INITIAL_SESSION before token refresh)
        // from logging users out on page refresh.
        if (session) {
          setSession(session);
          setUser(session.user);
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
        }
        // For other events with null session (INITIAL_SESSION, TOKEN_REFRESHED failure),
        // preserve existing state and let initializeAuth handle it.

        if (session?.user) {
          setCachedSession(session.user.id, session.user.email || '', session.expires_at || 0);
          
          // Only fetch roles if initializeAuth hasn't already done it
          if (!rolesFetched) {
            rolesFetched = true;
            fetchUserRoles(session.user.id, role, setRolesWithRef, setRole);
          }

        if (event === 'SIGNED_IN') {
            // Defer non-critical profile update — don't block login
            setTimeout(() => {
              supabase
                .from('profiles')
                .update({ last_active_at: new Date().toISOString() })
                .eq('id', session.user.id)
                .then(() => {});
            }, 5000);
          }
        } else if (event === 'SIGNED_OUT') {
          rolesFetched = false;
          setRole(null);
          setRolesWithRef([]);
          clearSessionCache();
        }
      },
    );

    const initializeAuth = async () => {
      const forceLoadingOff = setTimeout(() => {
        if (isMounted) {
          console.warn('[Auth] Init timeout after 8s — forcing loading off');
          setLoading(false);
        }
      }, 8000);

      // Start role fetch early from cache in parallel with getSession
      let earlyRoleFetch: Promise<void> | null = null;
      if (cachedSession?.userId && !rolesFetched) {
        rolesFetched = true;
        earlyRoleFetch = fetchUserRoles(cachedSession.userId, role, setRolesWithRef, setRole);
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          const msg = error.message?.toLowerCase() || '';
          const isAuthError = msg.includes('refresh_token') || msg.includes('invalid') || msg.includes('expired') || msg.includes('not authenticated');
          const isNetworkError = msg.includes('networkerror') || msg.includes('fetch') || msg.includes('network');
          if (isAuthError) {
            console.warn('[Auth] Auth token invalid, clearing:', error.message);
            clearAllAuthStorage();
            setSession(null);
            setUser(null);
            setRole(null);
            setRolesWithRef([]);
          } else if (isNetworkError) {
            console.warn('[Auth] Network error during session restore — proceeding offline:', error.message);
          } else {
            console.warn('[Auth] Transient getSession error:', error.message);
          }
        } else {
          if (session) {
            setSession(session);
            setUser(session.user);

            setCachedSession(session.user.id, session.user.email || '', session.expires_at || 0);
            // If early fetch was for the same user, just await it; otherwise fetch fresh
            if (earlyRoleFetch && cachedSession?.userId === session.user.id) {
              const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
              await Promise.race([earlyRoleFetch, timeoutPromise]);
            } else {
              rolesFetched = true;
              const rolePromise = fetchUserRoles(session.user.id, role, setRolesWithRef, setRole);
              const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
              await Promise.race([rolePromise, timeoutPromise]);
            }
          } else if (cachedSession) {
            console.log('[Auth] getSession() null but cached session exists — preserving state');
          } else {
            setSession(null);
            setUser(null);
            clearSessionCache();
          }
        }
      } catch (err: any) {
        console.warn('[Auth] Init failed (keeping session for retry):', err?.message);
      } finally {
        clearTimeout(forceLoadingOff);
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const switchRole = (newRole: AppRole) => {
    if (rolesRef.current.includes(newRole)) {
      setRole(newRole);
      try { localStorage.setItem('welile_last_role', newRole); } catch {}
    }
  };

  const addRole = async (newRole: AppRole) => {
    if (!user) return { error: new Error('No user logged in') };
    return addRoleForUser(user.id, newRole, rolesRef.current, role, setRolesWithRef, setRole);
  };

  /** Atomically grant a role (if missing) and switch to it */
  const grantAndSwitchRole = async (newRole: AppRole) => {
    if (!user) return { error: new Error('No user logged in') };
    if (!rolesRef.current.includes(newRole)) {
      const { error } = await addRoleForUser(user.id, newRole, rolesRef.current, role, setRolesWithRef, setRole);
      if (error) return { error };
    }
    // At this point rolesRef is already updated by setRolesWithRef
    setRole(newRole);
    return { error: null };
  };

  const signOut = async () => {
    await ops.signOutUser(user?.id);
    setUser(null);
    setSession(null);
    setRole(null);
    setRolesWithRef([]);
    clearSessionCache();
  };

  return (
    <AuthContext.Provider
      value={{
        user, session, role, roles, loading,
        signUp: ops.signUp,
        signUpWithoutRole: ops.signUpWithoutRole,
        signIn: ops.signIn,
        signInWithGoogle: ops.signInWithGoogle,
        signInWithApple: ops.signInWithApple,
        signOut,
        switchRole,
        addRole,
        grantAndSwitchRole,
        resetPassword: ops.resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
