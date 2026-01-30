import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { 
  getCachedSession, 
  setCachedSession, 
  clearSessionCache,
  getCachedRoles,
  setCachedRoles,
  getPreloadedSession,
  getPreloadedRoles
} from '@/lib/sessionCache';

export type AppRole = 'tenant' | 'agent' | 'landlord' | 'supporter' | 'manager';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  roles: AppRole[];
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, phone: string, role: AppRole) => Promise<{ error: Error | null }>;
  signUpWithoutRole: (email: string, password: string, fullName: string, phone: string, referrerId?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  switchRole: (role: AppRole) => void;
  addRole: (role: AppRole) => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // INSTANT: Use cached session/roles for immediate state
  const cachedSession = getPreloadedSession();
  const cachedRoles = getPreloadedRoles() as AppRole[] | null;
  
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(cachedRoles?.[0] || null);
  const [roles, setRoles] = useState<AppRole[]>(cachedRoles || []);
  // CRITICAL: Start with loading=false if we have cached data
  const [loading, setLoading] = useState(!cachedSession);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Cache session for instant reload
          setCachedSession(
            session.user.id, 
            session.user.email || '', 
            session.expires_at || 0
          );
          
          setTimeout(() => {
            fetchUserRoles(session.user.id);
          }, 0);
          
          // Update last_active_at on auth state change (login, token refresh, etc.)
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            supabase
              .from('profiles')
              .update({ last_active_at: new Date().toISOString() })
              .eq('id', session.user.id)
              .then(() => {});
          }
        } else {
          setRole(null);
          setRoles([]);
          clearSessionCache();
        }
      }
    );

    // Get session immediately and set loading false ASAP
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      // Set loading false immediately - don't wait for roles
      setLoading(false);
      if (session?.user) {
        // Cache for next load
        setCachedSession(
          session.user.id, 
          session.user.email || '', 
          session.expires_at || 0
        );
        fetchUserRoles(session.user.id);
      } else {
        clearSessionCache();
      }
    }).catch(() => {
      setLoading(false);
      clearSessionCache();
    });

    // Handle "Remember me" - sign out when browser closes if unchecked
    const handleBeforeUnload = () => {
      const sessionOnly = sessionStorage.getItem('welile_session_only');
      if (sessionOnly === 'true') {
        // Sign out synchronously by clearing storage
        localStorage.removeItem('sb-wirntoujqoyjobfhyelc-auth-token');
        clearSessionCache();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const fetchUserRoles = async (userId: string) => {
    // Only fetch roles that are enabled (not restricted by manager)
    const { data, error } = await supabase
      .from('user_roles')
      .select('role, enabled')
      .eq('user_id', userId)
      .eq('enabled', true);
    
    if (!error && data && data.length > 0) {
      const userRoles = data.map(r => r.role as AppRole);
      setRoles(userRoles);
      // Cache roles for instant reload
      setCachedRoles(userRoles);
      // Prioritize supporter role as default, otherwise use first role
      if (!role || !userRoles.includes(role)) {
        const defaultRole = userRoles.includes('supporter') ? 'supporter' : userRoles[0];
        setRole(defaultRole);
      }
    } else {
      setRoles([]);
      setRole(null);
      setCachedRoles([]);
    }
  };

  const switchRole = (newRole: AppRole) => {
    if (roles.includes(newRole)) {
      setRole(newRole);
    }
  };

  const addRole = async (newRole: AppRole) => {
    if (!user) return { error: new Error('No user logged in') };
    if (roles.includes(newRole)) return { error: null };

    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: user.id, role: newRole });

    if (!error) {
      const newRoles = [...roles, newRole];
      setRoles(newRoles);
      if (!role) {
        setRole(newRole);
      }
    }
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string, phone: string, role: AppRole) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          phone: phone,
          role: role
        }
      }
    });
    
    return { error: error as Error | null };
  };

  const signUpWithoutRole = async (email: string, password: string, fullName: string, phone: string, referrerId?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          phone: phone,
          referrer_id: referrerId || null
        }
      }
    });
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    // Update last_active_at and log login on successful sign in
    if (!error && data?.user) {
      const userId = data.user.id;
      
      // First, check if user was inactive for 30+ days before updating last_active_at
      const { data: profileData } = await supabase
        .from('profiles')
        .select('last_active_at, full_name')
        .eq('id', userId)
        .single();
      
      const wasLongInactive = profileData?.last_active_at 
        ? (new Date().getTime() - new Date(profileData.last_active_at).getTime()) / (1000 * 60 * 60 * 24) >= 30
        : false;
      
      // Update last_active_at
      supabase
        .from('profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', userId)
        .then(() => {});
      
      // Log login to user_login_history
      supabase
        .from('user_login_history')
        .insert({
          user_id: userId,
          login_method: 'password',
          success: true
        })
        .then(() => {});
      
      // Log to user_activity_log
      supabase
        .from('user_activity_log')
        .insert({
          user_id: userId,
          activity_type: 'login',
          description: wasLongInactive 
            ? 'Returned after 30+ days of inactivity' 
            : 'Logged in with password'
        })
        .then(() => {});
      
      // Notify managers if user was inactive for 30+ days
      if (wasLongInactive && profileData) {
        const daysInactive = Math.floor(
          (new Date().getTime() - new Date(profileData.last_active_at!).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // Get all managers
        supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'manager')
          .eq('enabled', true)
          .then(async ({ data: managers }) => {
            if (managers && managers.length > 0) {
              // Create in-app notifications for all managers
              const notifications = managers.map(m => ({
                user_id: m.user_id,
                title: '🎉 Inactive User Returned!',
                message: `${profileData.full_name || 'A user'} just logged back in after ${daysInactive} days of inactivity!`,
                type: 'success',
                metadata: {
                  returning_user_id: userId,
                  user_name: profileData.full_name,
                  days_inactive: daysInactive,
                  send_push: true
                }
              }));
              
              await supabase.from('notifications').insert(notifications);
              
              // Trigger push notifications via edge function
              try {
                await supabase.functions.invoke('send-push-notification', {
                  body: {
                    userIds: managers.map(m => m.user_id),
                    payload: {
                      title: '🎉 Inactive User Returned!',
                      body: `${profileData.full_name || 'A user'} logged back in after ${daysInactive} days!`,
                      url: '/user-management',
                      type: 'user_return'
                    }
                  }
                });
              } catch (e) {
                console.error('Failed to send push notification:', e);
              }
            }
          });
      }
    }
    
    return { error: error as Error | null };
  };

  const signInWithGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin
    });
    
    if (result.redirected) {
      return { error: null };
    }
    
    return { error: result.error ?? null };
  };

  const signOut = async () => {
    // Log logout before signing out
    if (user) {
      await supabase
        .from('user_activity_log')
        .insert({
          user_id: user.id,
          activity_type: 'logout',
          description: 'Logged out'
        });
    }
    
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
  };

  const resetPassword = async (email: string) => {
    const redirectUrl = `${window.location.origin}/update-password`;
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, role, roles, loading, signUp, signUpWithoutRole, signIn, signInWithGoogle, signOut, switchRole, addRole, resetPassword }}>
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
