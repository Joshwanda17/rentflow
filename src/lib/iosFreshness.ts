// ============================================================================
// Proactive iOS freshness watcher.
//
// Telemetry shows the "retry splash" / "Updating…" recovery screen is almost
// entirely an iOS phenomenon (~92% of recovery events, and iOS is the only
// platform that exhausts the retry loop). The root cause is platform-specific:
//
//   • iOS Safari/WebKit re-serves a previously cached `index.html` shell from
//     its HTTP/memory cache and skips revalidation far more aggressively than
//     Chrome, even with `no-cache` on the document.
//   • On resume from background — and on a bfcache "back/forward" restore —
//     iOS restores a SNAPSHOT of the old page (the stale shell) instead of
//     re-fetching. After a redeploy in between, the snapshot's content-hashed
//     chunk URLs no longer exist → 404 → chunk error → retry splash.
//   • Home-screen installs run an isolated, extremely persistent WebView cache
//     that keeps the old shell alive across releases.
//
// The existing version gate only reacts AFTER a chunk error. This watcher is
// proactive: when an iPhone returns to the foreground or is restored from
// bfcache, it checks `/version.json` (always `no-store`) against the running
// bundle and, if this device is provably running an outdated build, performs a
// clean reload onto the current shell BEFORE the user ever taps
// something that loads a now-missing chunk and gets trapped on the splash.
//
// Android is intentionally excluded — Chrome revalidates the document on
// navigation and bfcache restore, so it self-heals on a single reload and does
// not need this.
// ============================================================================

import { checkServerVersion, isIOS } from "./versionGate";
import { clearAndReload } from "./hardRecovery";
import { logUpdateFailure } from "./updateTelemetry";
import { isForcingUpdate, triggerForcedUpdate } from "./forcedUpdate";

let installed = false;
let recovering = false;
let lastCheckAt = 0;

// Throttle network checks so a flurry of visibility/pageshow events (common on
// iOS when the keyboard opens or the app multitasks) can't spam `/version.json`.
const MIN_CHECK_INTERVAL_MS = 60_000;

// While the app is open and foregrounded, proactively re-check the deployed
// version on a timer. Without this, an iPhone that loaded an OLD build and then
// stays open (never backgrounds) is NEVER pulled onto the new build until it
// happens to request a now-missing chunk and falls into the recovery loop.
// Polling lets us reach far-away devices we can't touch physically: the next
// deploy auto-updates them cleanly, on their own, with no tap and no 404 trap.
const FOREGROUND_POLL_INTERVAL_MS = 5 * 60_000; // 5 minutes
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function checkAndRecoverIfStale(reason: string): Promise<void> {
  if (recovering) return;
  // A server-mandated forced update takes precedence and owns the UI; never
  // double-trigger a reload underneath it.
  if (isForcingUpdate()) return;
  if (Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
  lastCheckAt = Date.now();

  const state = await checkServerVersion();
  if (!state.stale) return;

  // If the server demands a blocking forced update, hand off to the forced gate
  // (visible overlay + auto-update) instead of the silent soft reload.
  if (state.force) {
    triggerForcedUpdate(`ios_${reason}`);
    return;
  }

  recovering = true;
  logUpdateFailure("ios_version_gate", {
    chunk_mismatch: true,
    details: {
      proactive: true,
      reason,
      server: state.server,
      current: state.current,
    },
  });
  // Clean cache/SW purge + plain reload onto the current build.
  await clearAndReload("manual_reload");
}

// Start/stop the foreground poll based on tab visibility so we never burn
// battery or hit the network while the app is backgrounded.
function startForegroundPoll(): void {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      void checkAndRecoverIfStale("foreground_poll");
    }
  }, FOREGROUND_POLL_INTERVAL_MS);
}

function stopForegroundPoll(): void {
  if (pollTimer === null) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

/**
 * Install foreground/bfcache freshness checks for iPhone/iPad only. Safe to
 * call once on startup; never throws and never blocks. No-op off iOS and in
 * non-browser contexts.
 */
export function installIOSFreshnessWatch(): void {
  if (installed) return;
  installed = true;

  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!isIOS()) return;

    // bfcache restore: iOS hands back a stale page snapshot on back/forward
    // navigation. `persisted === true` means we were restored from the cache,
    // so the running shell may predate the live deploy.
    window.addEventListener("pageshow", (e) => {
      if ((e as PageTransitionEvent).persisted) {
        void checkAndRecoverIfStale("pageshow_persisted");
      }
    });

    // Resume from background: re-validate the shell whenever the app returns to
    // the foreground, the most common way an iPhone wakes onto a stale build.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void checkAndRecoverIfStale("visible");
        startForegroundPoll();
      } else {
        stopForegroundPoll();
      }
    });

    // Begin polling immediately when the app is already in the foreground.
    if (document.visibilityState === "visible") {
      startForegroundPoll();
    }
  } catch {
    /* freshness checks must never break the app */
  }
}