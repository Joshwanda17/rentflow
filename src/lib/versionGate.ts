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
  /**
   * True when the server demands a BLOCKING, forced update for this stale
   * device (the old build must not be allowed to keep running). Driven by the
   * `force` / `min` directives in version.json — see checkServerVersion.
   */
  force: boolean;
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
    const cached = JSON.parse(raw) as VersionGateState;
    // A cached "force update" directive belongs only to the bundle version that
    // wrote it. After the phone successfully loads the newer bundle, the old
    // localStorage record may still say `{ force: true }`; trusting that stale
    // record on startup causes iPhones to purge/reload forever before the fresh
    // network check has a chance to clear it.
    if (cached.current && cached.current !== CURRENT_APP_VERSION) {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        /* ignore */
      }
      return null;
    }
    return cached;
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

/**
 * Synchronous, non-blocking read of whether the server demands a BLOCKING
 * forced update for this device. Safe on the earliest startup path. Used to
 * block an old build before it ever imports a now-missing chunk.
 */
export function isForceUpdateSync(): boolean {
  return readCache()?.force ?? false;
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
    const res = await fetch(VERSION_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`version.json ${res.status}`);
    const data = (await res.json()) as {
      version?: string;
      /** When false, a mismatch is a SOFT update (silent reload, no block). */
      force?: boolean;
      /** Minimum supported build; running builds below it are forced. */
      min?: string;
    };
    const server = data?.version ? String(data.version) : null;
    const min = data?.min ? String(data.min) : null;
    // Only flag stale when we have BOTH values and they differ. A missing or
    // unreadable server value must never block the app.
    let stale = !!server && current !== "dev" && server !== current;
    // Explicit minimum-supported-version gate. Date-prefixed version strings
    // (`YYYY-MM-DD-…`) sort lexicographically, so a plain string compare is a
    // safe "is this build older than the floor?" test.
    if (!stale && min && current !== "dev" && current < min) {
      stale = true;
    }
    // The server controls whether a stale device is hard-blocked. `force`
    // defaults to true (block + auto-update) so a deploy forces every older
    // build off; ship `"force": false` in version.json to downgrade to a
    // silent soft reload instead.
    const force = stale && data?.force !== false;
    const state: VersionGateState = {
      server,
      current,
      stale,
      force,
      checkedAt: Date.now(),
    };
    writeCache(state);
    return state;
  } catch {
    return (
      readCache() ?? {
        server: null,
        current,
        stale: false,
        force: false,
        checkedAt: Date.now(),
      }
    );
  }
}