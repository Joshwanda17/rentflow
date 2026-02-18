import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import type { AppRole } from './types';

export async function signUp(email: string, password: string, fullName: string, phone: string, role: AppRole) {
  const redirectUrl = `${window.location.origin}/`;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: { full_name: fullName, phone, role },
    },
  });
  return { error: error as Error | null };
}

export async function signUpWithoutRole(email: string, password: string, fullName: string, phone: string, referrerId?: string) {
  const redirectUrl = `${window.location.origin}/`;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: { full_name: fullName, phone, referrer_id: referrerId || null },
    },
  });
  return { error: error as Error | null };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error as Error | null };
}

export async function signInWithGoogle() {
  const result = await lovable.auth.signInWithOAuth('google', {
    redirect_uri: `${window.location.origin}/auth`,
  });
  if (result.redirected) return { error: null };
  return { error: result.error ?? null };
}

export async function signInWithApple() {
  const result = await lovable.auth.signInWithOAuth('apple', {
    redirect_uri: `${window.location.origin}/auth`,
  });
  if (result.redirected) return { error: null };
  return { error: result.error ?? null };
}

export async function signOutUser(userId: string | undefined) {
  // Activity log insert stubbed for performance
  await supabase.auth.signOut();
}

export async function resetPassword(email: string) {
  // Always redirect to the custom domain to avoid Lovable auth-bridge invalidating the token
  const isCustomDomain = !window.location.hostname.includes('lovable.app') && !window.location.hostname.includes('lovableproject.com');
  const origin = isCustomDomain ? window.location.origin : 'https://welilereceipts.com';
  const redirectUrl = `${origin}/update-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
  return { error: error as Error | null };
}
