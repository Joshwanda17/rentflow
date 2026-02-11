import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
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

  const initialRoles: AppRole[] =
    cachedRoles && cachedRoles.length > 0
      ? cachedRoles.includes('agent') ? cachedRoles : ['agent', ...cachedRoles] as AppRole[]
      : DEFAULT_ROLES;

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(initialRoles.includes('agent') ? 'agent' : initialRoles[0]);
  const [roles, setRoles] = useState<AppRole[]>(initialRoles);
  const [loading, setLoading] = useState(!cachedSession);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setCachedSession(session.user.id, session.user.email || '', session.expires_at || 0);
          fetchUserRoles(session.user.id, role, setRoles, setRole);

          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            supabase
              .from('profiles')
              .update({ last_active_at: new Date().toISOString() })
              .eq('id', session.user.id)
              .then(() => {});
          }
        } else if (event === 'SIGNED_OUT') {
          setRole(null);
          setRoles([]);
          clearSessionCache();
        }
      },
    );

    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        // Detect stale/expired refresh token errors and clear everything
        if (error) {
          console.warn('[Auth] getSession error, clearing stale tokens:', error.message);
          clearAllAuthStorage();
          setSession(null);
          setUser(null);
          setRole(null);
          setRoles([]);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setCachedSession(session.user.id, session.user.email || '', session.expires_at || 0);
          await fetchUserRoles(session.user.id, role, setRoles, setRole);
        } else {
          clearSessionCache();
        }
      } catch (err: any) {
        console.warn('[Auth] Init failed, clearing stale tokens:', err?.message);
        // On network/timeout errors, clear stale tokens to prevent loops
        clearAllAuthStorage();
        if (isMounted) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    const handleBeforeUnload = () => {
      const sessionOnly = sessionStorage.getItem('welile_session_only');
      if (sessionOnly === 'true') {
        localStorage.removeItem('sb-wirntoujqoyjobfhyelc-auth-token');
        clearSessionCache();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const switchRole = (newRole: AppRole) => {
    if (roles.includes(newRole)) setRole(newRole);
  };

  const addRole = async (newRole: AppRole) => {
    if (!user) return { error: new Error('No user logged in') };
    return addRoleForUser(user.id, newRole, roles, role, setRoles, setRole);
  };

  const signOut = async () => {
    await ops.signOutUser(user?.id);
    setUser(null);
    setSession(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user, session, role, roles, loading,
        signUp: ops.signUp,
        signUpWithoutRole: ops.signUpWithoutRole,
        signIn: ops.signIn,
        signInWithGoogle: ops.signInWithGoogle,
        signOut,
        switchRole,
        addRole,
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
