// ============================================================================
// Server-controlled FORCED update gate (cross-platform).
//
// `version.json` is served with `Cache-Control: no-store`, so a fetch always
// returns the freshest deployed value — even on a device serving a stale shell
// from its HTTP cache. That makes it a server-controlled switch: when the
// deployed version (or an explicit `min` floor) is newer than the build baked
// into the running bundle, the server can DEMAND a blocking update.
//
// Unlike the silent soft reload (see iosFreshness.ts), a forced update:
//   • paints a full-screen, non-dismissible overlay ON TOP of everything so the
//     old build can no longer be used, and
//   • AUTOMATICALLY triggers the update flow (cache/SW purge + cache-busted
//     reload) after a short countdown — the user never has to hunt for a
//     button. A manual "Update now" button is shown only as a fallback in case
//     the automatic reload is blocked.
//
// The server controls the behaviour via version.json:
//   { "version": "2026-06-01-x" }                 → forced (default)
//   { "version": "2026-06-01-x", "force": false } → soft/silent reload only
//   { "version": "…", "min": "2026-05-15-x" }     → force builds below the floor
// ============================================================================

import { clearAndReload } from "./hardRecovery";
import { checkServerVersion, isForceUpdateSync } from "./versionGate";
import { logUpdateFailure } from "./updateTelemetry";

const OVERLAY_ID = "welile-forced-update";
// How long the blocking screen is shown before the update auto-fires. Short
// enough that the user isn't left waiting, long enough to read the message.
const AUTO_TRIGGER_DELAY_MS = 1800;
// Foreground re-check cadence so a device that stays open is pulled onto a
// newly-forced build without ever touching a missing chunk.
const POLL_INTERVAL_MS = 5 * 60_000;
const MIN_CHECK_INTERVAL_MS = 60_000;

let forcing = false;
let installed = false;
let lastCheckAt = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** True once a forced update is in progress — other recovery paths should defer. */
export function isForcingUpdate(): boolean {
  return forcing;
}

function renderBlockingOverlay(): void {
  try {
    if (document.getElementById(OVERLAY_ID)) return;
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-live", "assertive");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;" +
      "background:#f8fafc;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

    overlay.innerHTML = `
      <img src="/welile-logo.png" alt="Welile" width="56" height="56" style="border-radius:14px" />
      <div style="width:22px;height:22px;border:2px solid #7c3aed;border-top-color:transparent;border-radius:50%;animation:wfu .6s linear infinite"></div>
      <h2 style="font-size:20px;font-weight:700;margin:0">Updating Welile</h2>
      <p style="font-size:14px;color:#6b7280;margin:0;max-width:300px;line-height:1.5">
        A required update is installing automatically. This only takes a moment — please don't close the app.
      </p>
      <button id="${OVERLAY_ID}-btn" style="padding:14px 28px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;min-height:48px">Update now</button>
      <style>
        @keyframes wfu{to{transform:rotate(360deg)}}
        @media(prefers-color-scheme:dark){#${OVERLAY_ID}{background:#0f172a!important;color:#f8fafc!important}}
      </style>`;

    document.body.appendChild(overlay);

    const btn = document.getElementById(`${OVERLAY_ID}-btn`) as HTMLButtonElement | null;
    if (btn) {
      btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = "Updating…";
        void clearAndReload("manual_reload");
      };
    }
  } catch {
    /* overlay must never throw */
  }
}

/**
 * Block the old build and auto-run the update flow. Idempotent — repeated calls
 * after the first are no-ops. Safe to call from the earliest startup path.
 */
export function triggerForcedUpdate(reason: string): void {
  if (forcing) return;
  forcing = true;
  logUpdateFailure("ios_version_gate", {
    chunk_mismatch: true,
    details: { forced: true, reason, ui: "forced_update_gate" },
  });
  renderBlockingOverlay();
  // Auto-fire the update so the user never has to hunt for the button.
  setTimeout(() => {
    void clearAndReload("manual_reload");
  }, AUTO_TRIGGER_DELAY_MS);
}

async function checkAndForceIfRequired(reason: string): Promise<void> {
  if (forcing) return;
  if (Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
  lastCheckAt = Date.now();
  const state = await checkServerVersion();
  if (state.stale && state.force) {
    triggerForcedUpdate(reason);
  }
}

function startPoll(): void {
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      void checkAndForceIfRequired("foreground_poll");
    }
  }, POLL_INTERVAL_MS);
}

function stopPoll(): void {
  if (pollTimer === null) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

/**
 * Install the cross-platform forced-update watcher. Checks on startup, on
 * foreground/bfcache restore, and on a foreground timer. Safe to call once on
 * boot; never throws and never blocks. Call ONLY off preview/iframe hosts.
 */
export function installForcedUpdateWatch(): void {
  if (installed) return;
  installed = true;
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    // If the last known server directive already demands a forced update, block
    // immediately — before the old build can import a now-missing chunk.
    if (isForceUpdateSync()) {
      triggerForcedUpdate("startup_cached");
    } else {
      void checkAndForceIfRequired("startup");
    }

    window.addEventListener("pageshow", (e) => {
      if ((e as PageTransitionEvent).persisted) {
        void checkAndForceIfRequired("pageshow_persisted");
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void checkAndForceIfRequired("visible");
        startPoll();
      } else {
        stopPoll();
      }
    });

    if (document.visibilityState === "visible") startPoll();
  } catch {
    /* forced-update watch must never break the app */
  }
}
