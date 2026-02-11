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
          setRole(null);
          setRoles([]);
          clearSessionCache();
        }
      },
    );

    const initializeAuth = async () => {
      // Hard cap: loading MUST resolve within 8s no matter what
      const forceLoadingOff = setTimeout(() => {
        if (isMounted) {
          console.warn('[Auth] Init timeout after 8s — forcing loading off');
          setLoading(false);
        }
      }, 8000);

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error) {
          const msg = error.message?.toLowerCase() || '';
          const isAuthError = msg.includes('refresh_token') || msg.includes('invalid') || msg.includes('expired') || msg.includes('not authenticated');
          if (isAuthError) {
            console.warn('[Auth] Auth token invalid, clearing:', error.message);
            clearAllAuthStorage();
            setSession(null);
            setUser(null);
            setRole(null);
            setRoles([]);
          } else {
            console.warn('[Auth] Transient getSession error (keeping session):', error.message);
          }
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setCachedSession(session.user.id, session.user.email || '', session.expires_at || 0);
          // Don't let role fetch block loading — use a race with 5s timeout
          const rolePromise = fetchUserRoles(session.user.id, role, setRoles, setRole);
          const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
          await Promise.race([rolePromise, timeoutPromise]);
        } else {
          clearSessionCache();
        }
      } catch (err: any) {
        console.warn('[Auth] Init failed (keeping session for retry):', err?.message);
      } finally {
        clearTimeout(forceLoadingOff);
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    // Only clear auth on true tab/browser close, NOT on refresh.
    // We use 'pagehide' with persisted check — on refresh, persisted is true
    // and the page goes into bfcache; on close, persisted is false.
    const handlePageHide = (e: PageTransitionEvent) => {
      const sessionOnly = sessionStorage.getItem('welile_session_only');
      if (sessionOnly === 'true' && !e.persisted) {
        localStorage.removeItem('sb-wirntoujqoyjobfhyelc-auth-token');
        clearSessionCache();
      }
    };

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.removeEventListener('pagehide', handlePageHide);
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
