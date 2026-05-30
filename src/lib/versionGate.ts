// ============================================================================
// Hard iOS version gate.
//
// iPhones running Safari aggressively cache the built JS bundle. After a deploy
// the device can keep executing OLD JavaScript (an old `__APP_VERSION__` baked
// into the bundle) while the rest of the world is on the new build. On the old
// build the OTP / SMS verification flow talks to an outdated contract and the
// user gets stuck in an "invalid code" / endless "Updating…" recovery loop.
//
// `/version.json` is a tiny static file shipped with every build. The Lovable
// proxy serves it with `Cache-Control: no-store`, so a fetch ALWAYS returns the
// freshest deployed value — even on a phone that is serving a stale shell from
// its HTTP cache. Comparing that network value against the `__APP_VERSION__`
// compiled into the running bundle tells us, with certainty, whether THIS device
// is executing an outdated app.
//
// When it is, we stop letting the device limp along: the recovery screen is
// replaced by a hard "Update Required" gate, and the SMS code request is blocked
// until the user refreshes onto the current build.
// ============================================================================

declare const __APP_VERSION__: string;

const VERSION_URL = "/version.json";
const CACHE_KEY = "welile_version_gate";

/** The version compiled into THIS running bundle. */
export const CURRENT_APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

export interface VersionGateState {
  /** Latest version reported by the network (or null when unknown). */
  server: string | null;
  /** Version compiled into the running bundle. */
  current: string;
  /** True when the running bundle is older than the deployed build. */
  stale: boolean;
  /** epoch ms of the last successful/last check. */
  checkedAt: number;
}

/** True for iPhone/iPad/iPod, including iPadOS Safari that masquerades as Mac. */
export function isIOS(): boolean {
  try {
    const ua = navigator.userAgent || "";
    const classic = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    // iPadOS 13+ reports a desktop Mac UA but exposes multi-touch.
    const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    return classic || iPadOS;
  } catch {
    return false;
  }
}

function readCache(): VersionGateState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VersionGateState;
  } catch {
    return null;
  }
}

function writeCache(state: VersionGateState): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/**
 * Synchronous, non-blocking read of the last known gate result. Safe to call on
 * the earliest startup path and inside render — never touches the network.
 */
export function isVersionStaleSync(): boolean {
  return readCache()?.stale ?? false;
}

/** The last cached gate state (or null) — for diagnostics UI. */
export function getVersionGateState(): VersionGateState | null {
  return readCache();
}

/**
 * Fetch `/version.json` (always uncached) and compare it to the running bundle.
 * Never throws. Returns the freshly computed state, falling back to the cached
 * value (or a safe "not stale" default) when the network is unavailable.
 */
export async function checkServerVersion(): Promise<VersionGateState> {
  const current = CURRENT_APP_VERSION;
  try {
    const res = await fetch(`${VERSION_URL}?_=${Date.now().toString(36)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`version.json ${res.status}`);
    const data = (await res.json()) as { version?: string };
    const server = data?.version ? String(data.version) : null;
    // Only flag stale when we have BOTH values and they differ. A missing or
    // unreadable server value must never block the app.
    const stale = !!server && current !== "dev" && server !== current;
    const state: VersionGateState = {
      server,
      current,
      stale,
      checkedAt: Date.now(),
    };
    writeCache(state);
    return state;
  } catch {
    return (
      readCache() ?? { server: null, current, stale: false, checkedAt: Date.now() }
    );
  }
}