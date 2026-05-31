// Update-failure telemetry.
//
// When an iPhone (or any device) gets trapped on the "Updating…" screen, the
// app often can't fully boot — so a normal in-app logger never runs. This
// module logs the failure signals directly to the backend via a lightweight
// fetch beacon that does NOT depend on the React app or the Supabase client
// bundle. It can fire from the very earliest startup path (main.tsx) and from
// the hard-recovery routine, so even a stuck phone reports in.
//
// Captured per event: whether the service worker / caches were cleared, whether
// the loaded chunks mismatch the live deploy, how many reload attempts have
// happened, and the device's iOS / Safari version + user agent.

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/update_failure_events`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const SESSION_KEY = "welile_telemetry_session";

export type UpdateFailureEvent =
  | "chunk_error_detected"
  | "hard_recover"
  | "caches_purged"
  | "recovery_exhausted"
  | "error_ui_shown"
  | "ios_version_gate"
  | "killswitch_purge_succeeded"
  | "killswitch_purge_failed"
  | "manual_reload";

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        (crypto as any)?.randomUUID?.() ??
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-session";
  }
}

/** Parse the iOS version (e.g. "17.4.1") from the user agent, if present. */
export function parseIOSVersion(ua: string): string | null {
  // "CPU iPhone OS 17_4_1 like Mac OS X" / "CPU OS 16_3 like Mac OS X"
  const m = ua.match(/OS (\d+)[._](\d+)(?:[._](\d+))?/i);
  if (!m) return null;
  return [m[1], m[2], m[3]].filter(Boolean).join(".");
}

/** Parse the Safari (WebKit "Version/x.y") version from the user agent. */
export function parseSafariVersion(ua: string): string | null {
  const m = ua.match(/Version\/(\d+(?:\.\d+)*)/i);
  return m ? m[1] : null;
}

function detectDevice() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  let isStandalone = false;
  try {
    isStandalone =
      (window.navigator as any).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    isStandalone = false;
  }
  return {
    is_ios: isIOS,
    is_safari: isSafari,
    is_standalone: isStandalone,
    ios_version: isIOS ? parseIOSVersion(ua) : null,
    safari_version: parseSafariVersion(ua),
    user_agent: ua,
  };
}

export interface UpdateFailureFields {
  chunk_mismatch?: boolean | null;
  reload_attempts?: number | null;
  sw_cleared?: boolean | null;
  cache_cleared?: boolean | null;
  details?: Record<string, unknown>;
}

/**
 * Fire-and-forget telemetry beacon. Never throws, never blocks startup, and
 * uses `keepalive` so the request survives an immediate navigation/reload.
 */
export function logUpdateFailure(
  event: UpdateFailureEvent,
  fields: UpdateFailureFields = {}
): void {
  try {
    if (!ENDPOINT || !ANON_KEY) return;
    const device = detectDevice();
    const body = JSON.stringify({
      event_type: event,
      chunk_mismatch: fields.chunk_mismatch ?? null,
      reload_attempts: fields.reload_attempts ?? null,
      sw_cleared: fields.sw_cleared ?? null,
      cache_cleared: fields.cache_cleared ?? null,
      session_id: getSessionId(),
      url: window.location.href,
      details: fields.details ?? {},
      ...device,
    });
    void fetch(ENDPOINT, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body,
    }).catch(() => {
      /* telemetry must never break the app */
    });
  } catch {
    /* telemetry must never break the app */
  }
}