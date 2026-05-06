import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { getPublicOrigin } from '@/lib/getPublicOrigin';
import type { AppRole } from './types';

const MAINTENANCE_LOCK_MESSAGE =
  'Welile is under maintenance. Sign-in and sign-up are temporarily disabled while we reconcile the platform. Please check back shortly.';

const hasMaintenanceBypass = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'c10') {
      sessionStorage.setItem('welile.maintenance.bypass', '1');
      return true;
    }
    return sessionStorage.getItem('welile.maintenance.bypass') === '1';
  } catch {
    return false;
  }
};

const maintenanceError = () => ({ error: new Error(MAINTENANCE_LOCK_MESSAGE) as Error });

export async function signUp(
  email: string,
  password: string,
  fullName: string,
  phone: string,
  role: AppRole,
  signupSource?: string,
  referrerId?: string,
) {
  if (!hasMaintenanceBypass()) return maintenanceError();
  const redirectUrl = `${window.location.origin}/`;
  // Build metadata explicitly. Only include `signup_source` when it is a
  // non-empty string so the Postgres `handle_new_user` trigger persists it
  // verbatim into `profiles.signup_source` (it NULLIFs empty strings).
  const data: Record<string, unknown> = { full_name: fullName, phone, role };
  const trimmedSource = (signupSource ?? '').trim();
  if (trimmedSource) {
    data.signup_source = trimmedSource;
    // eslint-disable-next-line no-console
    console.log('[signUp] attribution →', { signup_source: trimmedSource, role });
  }
  const trimmedReferrer = (referrerId ?? '').trim();
  // Strict RFC-4122 UUID v1–v8 (lowercase or upper). The DB trigger does a
  // second-layer existence + self-ref + frozen check before accepting it,
  // but we still drop obviously-malformed input client-side so it never
  // reaches the auth metadata in the first place.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (trimmedReferrer && UUID_RE.test(trimmedReferrer)) {
    data.referrer_id = trimmedReferrer.toLowerCase();
    // eslint-disable-next-line no-console
    console.log('[signUp] referrer →', data.referrer_id);
  } else if (trimmedReferrer) {
    // eslint-disable-next-line no-console
    console.warn('[signUp] referrer dropped — not a valid UUID:', trimmedReferrer);
  }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectUrl, data },
  });
  return { error: error as Error | null };
}

export async function signUpWithoutRole(email: string, password: string, fullName: string, phone: string, referrerId?: string, intendedRole?: string) {
  if (!hasMaintenanceBypass()) return maintenanceError();
  const redirectUrl = `${window.location.origin}/`;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: { full_name: fullName, phone, referrer_id: referrerId || null, intended_role: intendedRole || null },
    },
  });
  return { error: error as Error | null };
}

export async function signIn(email: string, password: string) {
  if (!hasMaintenanceBypass()) return maintenanceError();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error as Error | null };
}

async function attemptOAuth(provider: 'google' | 'apple', redirectUri: string) {
  console.log(`[OAuth] Attempting ${provider} with redirect_uri:`, redirectUri);
  const result = await lovable.auth.signInWithOAuth(provider, {
    redirect_uri: redirectUri,
  });
  console.log(`[OAuth] ${provider} result:`, { redirected: result.redirected, error: result.error?.message });
  return result;
}

function isPreviewHost(hostname: string) {
  return hostname.includes('id-preview--') || hostname.includes('preview--') || hostname.endsWith('.lovableproject.com');
}

async function preparePreviewOAuthFlow() {
  if (!isPreviewHost(window.location.hostname)) return;

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (error) {
    console.warn('[OAuth] Failed to clear preview service workers/caches:', error);
  }
}

export async function signInWithGoogle() {
  if (!hasMaintenanceBypass()) return maintenanceError();
  await preparePreviewOAuthFlow();

  // Use current origin so OAuth callback returns to wherever the user is
  // (preview domain OR custom domain — both must work)
  const primaryUri = window.location.origin;

  console.log('[OAuth:Google] domain:', window.location.hostname, '| redirect_uri:', primaryUri);

  const result = await attemptOAuth('google', primaryUri);
  if (result.redirected) return { error: null };

  // If provider not supported error, retry with canonical public origin as fallback
  const errMsg = result.error?.message || '';
  if (errMsg.toLowerCase().includes('not supported') || errMsg.toLowerCase().includes('provider')) {
    console.warn('[OAuth:Google] Primary redirect failed, retrying with public origin...');
    const fallbackUri = getPublicOrigin();
    if (fallbackUri !== primaryUri) {
      const retry = await attemptOAuth('google', fallbackUri);
      if (retry.redirected) return { error: null };
      return { error: retry.error ?? null };
    }
  }

  return { error: result.error ?? null };
}

export async function signInWithApple() {
  if (!hasMaintenanceBypass()) return maintenanceError();
  await preparePreviewOAuthFlow();

  const primaryUri = window.location.origin;

  console.log('[OAuth:Apple] domain:', window.location.hostname, '| redirect_uri:', primaryUri);

  const result = await attemptOAuth('apple', primaryUri);
  if (result.redirected) return { error: null };

  const errMsg = result.error?.message || '';
  if (errMsg.toLowerCase().includes('not supported') || errMsg.toLowerCase().includes('provider')) {
    console.warn('[OAuth:Apple] Primary redirect failed, retrying with public origin...');
    const fallbackUri = getPublicOrigin();
    if (fallbackUri !== primaryUri) {
      const retry = await attemptOAuth('apple', fallbackUri);
      if (retry.redirected) return { error: null };
      return { error: retry.error ?? null };
    }
  }

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
