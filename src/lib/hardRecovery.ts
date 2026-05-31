// Shared "break the stale-shell loop" recovery for chunk/asset load failures.
//
// On iOS Safari a plain location.reload() frequently re-serves the cached
// index.html shell from the browser HTTP cache. That stale shell points at
// content-hashed chunk filenames that no longer exist after a deploy, so the
// app throws a chunk error, shows "Updating…", reloads, and gets the SAME
// stale shell again — an infinite "Updating…" loop where the app never loads.
//
// To truly break the loop we must:
//   1. Unregister all service workers.
//   2. Delete ALL caches (not just welile-* — the stale shell may live in any).
//   3. Reload to a cache-busted URL so iOS re-fetches a fresh document from
//      the network instead of from its HTTP cache.
//
// We also cap the number of automatic recovery attempts within a short window
// so a genuinely broken state surfaces actionable UI instead of cycling forever.

const ATTEMPT_KEY = "welile_recovery_attempts";
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_RECOVERY_ATTEMPTS = 3;

import { logUpdateFailure, type UpdateFailureEvent } from "./updateTelemetry";

interface AttemptRecord {
  count: number;
  first: number;
}

/**
 * Structured outcome of a purge pass. Callers (notably the forced-update
 * overlay) use this to SURFACE failures to the user instead of silently
 * reloading onto a still-stale shell. `errors` is a flat list of
 * human-readable messages safe to render directly.
 */
export interface PurgeResult {
  swUnregistered: number;
  cachesDeleted: number;
  swReregistered: boolean;
  /** Names of caches that survived every delete pass (still present). */
  survivingCaches: string[];
  /** Human-readable failure messages collected across all steps. */
  errors: string[];
}

/** Path of the static kill-switch service worker we re-register after a purge. */
const KILL_SWITCH_SW = "/sw.js";
const CACHE_DELETE_PASSES = 3;

function describeError(prefix: string, err: unknown): string {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();
  return `${prefix}: ${msg || "unknown error"}`;
}

function readAttempts(): AttemptRecord {
  try {
    const raw = localStorage.getItem(ATTEMPT_KEY);
    if (!raw) return { count: 0, first: Date.now() };
    const parsed = JSON.parse(raw) as AttemptRecord;
    // Reset the window if it has expired
    if (Date.now() - parsed.first > ATTEMPT_WINDOW_MS) {
      return { count: 0, first: Date.now() };
    }
    return parsed;
  } catch {
    return { count: 0, first: Date.now() };
  }
}

/** How many automatic recovery attempts have happened in the current window. */
export function getRecoveryAttempts(): number {
  return readAttempts().count;
}

/** True when we've exhausted automatic retries and should stop auto-reloading. */
export function recoveryExhausted(): boolean {
  return getRecoveryAttempts() >= MAX_RECOVERY_ATTEMPTS;
}

/** Call after a successful app mount to clear the failure counter. */
export function clearRecoveryAttempts(): void {
  try {
    localStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // ignore
  }
}

function recordAttempt(): void {
  try {
    const current = readAttempts();
    const next: AttemptRecord = {
      count: current.count + 1,
      first: current.count === 0 ? Date.now() : current.first,
    };
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** Wipe SWs + every cache. Resolves even if individual steps fail. */
export async function purgeCachesAndServiceWorkers(): Promise<void> {
  let swCleared = false;
  let cacheCleared = false;
  let serviceWorkerCount = 0;
  let cacheNames: string[] = [];
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      serviceWorkerCount = regs.length;
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      swCleared = regs.length > 0;
    }
  } catch {
    // ignore
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      cacheNames = keys;
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      cacheCleared = keys.length > 0;
    }
  } catch {
    // ignore
  }
  logUpdateFailure("caches_purged", {
    sw_cleared: swCleared,
    cache_cleared: cacheCleared,
    reload_attempts: getRecoveryAttempts(),
    details: {
      serviceWorkerCount,
      cacheCount: cacheNames.length,
      cacheNames,
    },
  });
}

export function reloadWithCacheBust(): void {
  try {
    const url = new URL(window.location.href);
    // Cache-bust the document fetch. Use a stable param name so repeated
    // recoveries replace (not stack) the value.
    url.searchParams.set("_v", Date.now().toString(36));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

// IMPORTANT: clearAndReload must NOT call clearRecoveryAttempts(). Doing so
// reset the attempt counter on every (auto or tapped) reload, which let an
// iPhone serving a 404-ing route chunk cycle hard_recover 1→2→3 → manual_reload
// (counter reset) → 1→2→3 → … forever, so the exhaustion cap never tripped and
// the terminal recovery UI never showed. The ONLY legitimate reset is the
// "app stayed mounted for 45s" timer in main.tsx — a true sign we recovered.
export async function clearAndReload(
  event: UpdateFailureEvent = "manual_reload"
): Promise<void> {
  logUpdateFailure(event, { reload_attempts: getRecoveryAttempts() });
  await purgeCachesAndServiceWorkers();
  reloadWithCacheBust();
}

/**
 * Full hard recovery: record the attempt, purge caches/SWs, then reload to a
 * cache-busted URL so iOS Safari fetches a fresh HTML shell from the network.
 */
export async function hardRecover(): Promise<void> {
  recordAttempt();
  logUpdateFailure("hard_recover", {
    reload_attempts: getRecoveryAttempts(),
    chunk_mismatch: true,
  });
  await purgeCachesAndServiceWorkers();
  reloadWithCacheBust();
}
