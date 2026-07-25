/**
 * Stale-session detector.
 *
 * Some browsers (especially installed PWAs / iOS home-screen icons and long-lived
 * tabs on flaky networks) end up holding a Supabase access token that the auth
 * server no longer accepts. The tell-tale server responses are:
 *
 *   - HTTP 401 `bad_jwt`
 *   - HTTP 403 `invalid claim: missing sub claim`
 *
 * When we see one of those, we:
 *   1. Force a token refresh via `supabase.auth.refreshSession()`.
 *   2. If the refresh succeeds, dispatch `welile:session-rehydrated` so app
 *      state (React Query, wallet balances, etc.) can invalidate itself.
 *   3. If the refresh fails, wipe all cached auth storage, sign out, and send
 *      the user to `/auth`.
 *
 * The detector is throttled to at most one attempt every 30 seconds to avoid
 * refresh storms if many concurrent requests fail at once.
 */
import { supabase } from '@/integrations/supabase/client';
import { clearAllAuthStorage, clearSessionCache } from '@/lib/sessionCache';

const STALE_TOKEN_MARKERS = [
  'bad_jwt',
  'missing sub claim',
  'missing sub',
  'invalid claim',
  'jwt expired',
  'jwt malformed',
  'token is expired',
];

const REHYDRATE_EVENT = 'welile:session-rehydrated';
const SIGNED_OUT_EVENT = 'welile:session-forced-signout';
const THROTTLE_MS = 30_000;

let installed = false;
let inFlight: Promise<void> | null = null;
let lastAttempt = 0;
let forcedSignOut = false;

function isSupabaseUrl(url: string): boolean {
  try {
    const base = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
    if (base && url.startsWith(base)) return true;
  } catch {
    /* ignore */
  }
  return /\.supabase\.co\/|\.supabase\.in\/|\.lovable\.cloud\//.test(url);
}

function matchesStaleToken(text: string, status: number): boolean {
  if (status !== 401 && status !== 403) return false;
  const lower = (text || '').toLowerCase();
  return STALE_TOKEN_MARKERS.some((marker) => lower.includes(marker));
}

async function handleStaleToken(reason: string): Promise<void> {
  if (forcedSignOut) return;
  const now = Date.now();
  if (now - lastAttempt < THROTTLE_MS) return;
  lastAttempt = now;

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      console.warn('[StaleSession] Detected stale token —', reason, '— forcing refresh');
      const { data, error } = await supabase.auth.refreshSession();

      if (!error && data.session) {
        console.info('[StaleSession] Refresh succeeded — rehydrating app state');
        try {
          window.dispatchEvent(
            new CustomEvent(REHYDRATE_EVENT, { detail: { userId: data.session.user.id } }),
          );
        } catch {
          /* ignore */
        }
        return;
      }

      // Refresh failed → the session is truly dead. Sign out cleanly.
      forcedSignOut = true;
      console.warn('[StaleSession] Refresh failed — signing out:', error?.message);
      try {
        window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT, { detail: { reason } }));
      } catch {
        /* ignore */
      }
      try {
        clearSessionCache();
        clearAllAuthStorage();
      } catch {
        /* ignore */
      }
      try {
        await supabase.auth.signOut();
      } catch {
        /* ignore */
      }

      // Redirect once, preserving the intended path so the user returns after login.
      try {
        const next = window.location.pathname + window.location.search;
        const alreadyOnAuth = window.location.pathname.startsWith('/auth');
        if (!alreadyOnAuth) {
          const url = `/auth?next=${encodeURIComponent(next)}&reason=stale_session`;
          window.location.replace(url);
        }
      } catch {
        /* ignore */
      }
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Installs a global `fetch` interceptor that watches Supabase responses for
 * stale-token errors. Safe to call multiple times — installs at most once.
 */
export function installStaleSessionDetector(): void {
  if (installed) return;
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);

    try {
      if (response.status !== 401 && response.status !== 403) return response;

      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : '';
      if (!url || !isSupabaseUrl(url)) return response;

      // Clone so the caller still sees an untouched body.
      const cloned = response.clone();
      const bodyText = await cloned.text().catch(() => '');

      if (matchesStaleToken(bodyText, response.status)) {
        // Fire-and-forget — don't block the caller. The caller will surface
        // the original error and the detector will refresh/redirect in the
        // background.
        void handleStaleToken(`http_${response.status}:${url.split('?')[0]}`);
      }
    } catch {
      /* never let the detector break real requests */
    }

    return response;
  };

  // Also listen for `onAuthStateChange` TOKEN_REFRESHED failures reported as
  // `SIGNED_OUT` — normal signOut is fine, but a SIGNED_OUT that fires while
  // the user is deep in the app (no explicit user action) usually means the
  // refresh token was rejected. That path is already handled by the fetch
  // interceptor above catching the /token 401, so no extra listener needed.
}

export const STALE_SESSION_EVENTS = {
  rehydrated: REHYDRATE_EVENT,
  forcedSignOut: SIGNED_OUT_EVENT,
};