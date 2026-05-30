// Runs ONCE, synchronously, as an import side-effect at the very top of the
// app boot — BEFORE the Supabase client or session cache read any stored token.
//
// If the previous login chose NOT to "remember this device" (ephemeral), and
// this is a fresh cold start of the browser (no live sessionStorage marker),
// we drop the stored auth token so the user is required to sign in again
// (OTP / password). Same-tab reloads keep the session because the marker
// survives reloads but not a full browser/tab close.
//
// IMPORTANT: this module must have NO imports so it executes before any other
// module's top-level code (it is imported first in main.tsx).

const EPHEMERAL_SESSION_KEY = 'welile_ephemeral_session';
const SESSION_ACTIVE_KEY = 'welile_session_active';
const SUPABASE_AUTH_TOKEN_KEY = 'sb-wirntoujqoyjobfhyelc-auth-token';
const SESSION_CACHE_KEY = 'welile_session_cache';
const ROLES_CACHE_KEY = 'welile_roles_cache';

try {
  const ephemeral = localStorage.getItem(EPHEMERAL_SESSION_KEY) === 'true';
  const sessionLive = sessionStorage.getItem(SESSION_ACTIVE_KEY) === '1';

  if (ephemeral && !sessionLive) {
    // Cold start after the browser was fully closed → require fresh sign-in.
    localStorage.removeItem(SUPABASE_AUTH_TOKEN_KEY);
    localStorage.removeItem(SESSION_CACHE_KEY);
    localStorage.removeItem(ROLES_CACHE_KEY);
  }

  // Mark this browsing session as live for the rest of its lifetime.
  sessionStorage.setItem(SESSION_ACTIVE_KEY, '1');
} catch {
  // Ignore storage access failures.
}

export {};
