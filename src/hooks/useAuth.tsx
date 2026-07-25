import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { setReportingTags } from '@/lib/errorReporting';
import {
  setCachedSession,
  clearSessionCache,
  clearAllAuthStorage,
  getPreloadedSession,
  getPreloadedRoles,
} from '@/lib/sessionCache';
import { installStaleSessionDetector, STALE_SESSION_EVENTS } from '@/lib/staleSessionDetector';


// Re-export types so existing imports keep working
export type { AppRole } from './auth/types';
export type { AuthContextType } from './auth/types';

import type { AppRole, AuthContextType } from './auth/types';
import { DEFAULT_ROLES, fetchUserRoles, addRoleForUser } from './auth/roleManager';
import * as ops from './auth/authOperations';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function enforceAccountAccess(userId: string): Promise<boolean> {
  try {
    const [{ data: profile }, { data: fraudBlocked }] = await Promise.all([
      supabase
        .from('profiles')
        .select('is_frozen, frozen_reason')
        .eq('id', userId)
        .maybeSingle(),
      (supabase as any).rpc('is_fraud_identifier_blocked', {
        p_type: 'user_id',
        p_value: userId,
      }),
    ]);

    // Frozen accounts are ALLOWED to sign in — the AccountFrozenGate overlay
    // renders a full-screen "Account Frozen" screen with support contact info
    // as soon as the session hydrates. Only hard fraud blocks force sign-out.
    if (fraudBlocked === true) {
      try {
        localStorage.setItem(
          'welile_account_blocked_reason',
          profile?.frozen_reason || 'This account has been permanently restricted for fraud review.',
        );
      } catch { /* ignore */ }
      clearAllAuthStorage();
      await supabase.auth.signOut();
      window.location.href = '/auth';
      return false;
    }
  } catch (error) {
    console.warn('[Auth] account access guard failed:', error);
  }
  return true;
}

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

    // Install the global stale-session detector once. It watches Supabase
    // responses for bad_jwt / missing sub errors and forces a token refresh
    // (or a clean sign-out if the refresh token itself is dead).
    installStaleSessionDetector();

    // When the detector successfully refreshes the token, re-fetch roles so
    // any stale in-memory identity state is rehydrated from the new session.
    const onRehydrated = () => {
      if (!isMounted) return;
      supabase.auth.getSession().then(({ data: { session: fresh } }) => {
        if (!isMounted || !fresh?.user) return;
        setSession(fresh);
        setUser(fresh.user);
        setCachedSession(fresh.user.id, fresh.user.email || '', fresh.expires_at || 0);
        fetchUserRoles(fresh.user.id, role, setRolesWithRef, setRole).catch(() => { /* ignore */ });
      }).catch(() => { /* ignore */ });
    };
    window.addEventListener(STALE_SESSION_EVENTS.rehydrated, onRehydrated as EventListener);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;

        // OTP login fallback guard: when a session is established right after an
        // OTP-initiated magic-link redirect, verify the resolved auth user id
        // (stashed by the OTP login flow) matches the session we actually
        // landed on. If a stale/mismatched email resolved a different account,
        // abort and sign out instead of completing sign-in on the wrong account.
        if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          let expectedUid: string | null = null;
          try { expectedUid = localStorage.getItem('welile_otp_expected_uid'); } catch { /* ignore */ }
          if (expectedUid) {
            if (expectedUid === session.user.id) {
              // Matched — consume the guard and continue normally.
              try { localStorage.removeItem('welile_otp_expected_uid'); } catch { /* ignore */ }
            } else {
              // Wrong account resolved — do not complete sign-in.
              try {
                localStorage.removeItem('welile_otp_expected_uid');
                localStorage.setItem('welile_otp_mismatch', '1');
              } catch { /* ignore */ }
              // Audit the profile/session mismatch with both the expected
              // (OTP-resolved) and actual (session) user ids. Fire-and-forget.
              try {
                const actualUid = session.user.id;
                supabase.functions.invoke('otp-login', {
                  body: {
                    action: 'report_mismatch',
                    expected_user_id: expectedUid,
                    actual_user_id: actualUid,
                  },
                }).catch(() => { /* logging must not block sign-out */ });
              } catch { /* ignore */ }
              setSession(null);
              setUser(null);
              // Defer signOut out of the callback — calling auth methods
              // synchronously here deadlocks the auth client.
              setTimeout(() => {
                supabase.auth.signOut().finally(() => { window.location.href = '/auth'; });
              }, 0);
              return;
            }
          }
          setTimeout(() => {
            enforceAccountAccess(session.user.id).catch(() => { /* non-blocking */ });
          }, 0);
        }

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
            // CRITICAL: defer out of the onAuthStateChange callback. Calling
            // Supabase auth methods (fetchUserRoles → supabase.auth.getUser())
            // synchronously inside this callback deadlocks the auth client,
            // which freezes every later query. This path is what runs on a
            // fresh/second device (no cached session), so without the defer
            // the user stays logged in but no data ever loads.
            const uid = session.user.id;
            setTimeout(() => {
              fetchUserRoles(uid, role, setRolesWithRef, setRole);
            }, 0);
          }

        if (event === 'SIGNED_IN') {
            // Record OAuth funnel completion if this sign-in came back from a
            // Google/Apple redirect (no-op when there is no pending funnel).
            setTimeout(() => {
              import('@/lib/oauthFunnel')
                .then((m) => m.completePendingOAuthFunnel(session.user.id))
                .catch(() => {});
            }, 0);
            // If Google sign-in previously failed with "account already exists"
            // and the user then signed in with their password, auto-link the
            // Google identity to this account.
            setTimeout(() => {
              (async () => {
                try {
                  const { getPendingIdentityLink, clearPendingIdentityLink } =
                    await import('@/lib/pendingIdentityLink');
                  const pending = getPendingIdentityLink();
                  if (!pending) return;
                  const { error } = await supabase.auth.linkIdentity({
                    provider: pending.provider,
                    options: { redirectTo: `${window.location.origin}/settings?linked=${pending.provider}` },
                  });
                  if (!error) clearPendingIdentityLink();
                } catch { /* ignore */ }
              })();
            }, 0);
            // If this browser has a pending campaign attribution, attach it
            // to the new session. Fire-and-forget, idempotent server-side.
            setTimeout(() => {
              import('@/lib/campaignAttribution')
                .then((m) => m.attachCampaignIfPresent())
                .catch(() => {});
            }, 500);
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
            const allowed = await enforceAccountAccess(session.user.id);
            if (!allowed || !isMounted) return;
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
      window.removeEventListener(STALE_SESSION_EVENTS.rehydrated, onRehydrated as EventListener);
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

  // Keep the error-reporting pipeline tagged with the current user + role so
  // every captured exception (boundary, window.onerror, unhandledrejection)
  // is traceable per identity.
  useEffect(() => {
    setReportingTags({ userId: user?.id ?? null, role: role ?? null });
  }, [user?.id, role]);

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
