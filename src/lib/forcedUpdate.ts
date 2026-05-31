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

import {
  purgeCachesAndServiceWorkers,
  reloadWithCacheBust,
  type PurgeResult,
} from "./hardRecovery";
import { checkServerVersion, CURRENT_APP_VERSION, getVersionGateState, isForceUpdateSync } from "./versionGate";
import { logUpdateFailure } from "./updateTelemetry";
import { getRecoveryAttempts, MAX_RECOVERY_ATTEMPTS } from "./hardRecovery";
import {
  pushUpdateDebug,
  formatUpdateDebugLog,
} from "./updateDebugLog";

const OVERLAY_ID = "welile-forced-update";
const ERROR_ID = `${OVERLAY_ID}-error`;
const DEBUG_ID = `${OVERLAY_ID}-debug`;
const INSTR_ID = `${OVERLAY_ID}-instructions`;
// How long the blocking screen is shown before the update auto-fires. Short
// enough that the user isn't left waiting, long enough to read the message.
const AUTO_TRIGGER_DELAY_MS = 1800;
// Foreground re-check cadence so a device that stays open is pulled onto a
// newly-forced build without ever touching a missing chunk.
const POLL_INTERVAL_MS = 5 * 60_000;
const MIN_CHECK_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// iPhone loop-breaker.
//
// Telemetry proved the failure mode: the cache/SW purge SUCCEEDS, but the
// programmatic cache-busted reload (location.replace) still re-fetches iOS
// Safari's HTTP-cached index.html, so the device boots the SAME stale bundle
// and re-enters recovery forever. A programmatic reload can never win against
// the document HTTP cache on these devices.
//
// The ONLY reliable escape is a navigation initiated from a real user gesture
// (a tap), which WebKit revalidates against the network. So we allow a small
// number of automatic reload attempts, and once those are spent we STOP
// auto-reloading and present a static "Open latest version" button. Tapping it
// performs the purge + reload inside a user-activation context, which defeats
// the cached shell.
// ---------------------------------------------------------------------------
const FORCED_RELOAD_KEY = "welile_forced_auto_reloads";
const FORCED_RELOAD_WINDOW_MS = 5 * 60_000;
const MAX_FORCED_AUTO_RELOADS = 2;

interface ForcedReloadRecord {
  count: number;
  first: number;
}

function readForcedReloads(): ForcedReloadRecord {
  try {
    const raw = localStorage.getItem(FORCED_RELOAD_KEY);
    if (!raw) return { count: 0, first: Date.now() };
    const parsed = JSON.parse(raw) as ForcedReloadRecord;
    if (Date.now() - parsed.first > FORCED_RELOAD_WINDOW_MS) {
      return { count: 0, first: Date.now() };
    }
    return parsed;
  } catch {
    return { count: 0, first: Date.now() };
  }
}

/** How many automatic forced-update reloads have fired in the current window. */
function forcedAutoReloadCount(): number {
  return readForcedReloads().count;
}

function recordForcedAutoReload(): void {
  try {
    const current = readForcedReloads();
    const next: ForcedReloadRecord = {
      count: current.count + 1,
      first: current.count === 0 ? Date.now() : current.first,
    };
    localStorage.setItem(FORCED_RELOAD_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/**
 * Clear the forced auto-reload counter. Call ONLY once the app has confirmably
 * mounted the fresh build (see main.tsx's 45s stability timer) — never on every
 * reload, or the cap can never be reached.
 */
export function clearForcedAutoReloads(): void {
  try {
    localStorage.removeItem(FORCED_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * True while it is still safe to attempt an AUTOMATIC reload. Once the auto cap
 * (or the shared recovery cap) is hit we must hand off to a user-gesture button
 * instead of reloading again — a programmatic reload cannot beat the iOS HTTP
 * document cache, so looping is pointless and just burns the user's time.
 */
function canAutoReload(): boolean {
  return (
    forcedAutoReloadCount() < MAX_FORCED_AUTO_RELOADS &&
    getRecoveryAttempts() < MAX_RECOVERY_ATTEMPTS
  );
}

let forcing = false;
let installed = false;
let lastCheckAt = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** True once a forced update is in progress — other recovery paths should defer. */
export function isForcingUpdate(): boolean {
  return forcing;
}

/**
 * Purge caches + service workers, then reload — surfacing any purge failures on
 * the blocking overlay instead of silently reloading onto a still-stale shell.
 * When the purge fully succeeds we reload immediately; when it reports errors we
 * keep the screen up, show what went wrong, and let the user retry / hard-quit.
 */
async function purgeThenReload(): Promise<void> {
  let result: PurgeResult;
  pushUpdateDebug("forced: purgeThenReload start", {
    reload_attempts: getRecoveryAttempts(),
  });
  try {
    result = await purgeCachesAndServiceWorkers();
  } catch (err) {
    pushUpdateDebug("forced: purge threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    showPurgeErrors([
      err instanceof Error ? err.message : "Unexpected error while clearing data",
    ]);
    renderDebugPanel();
    return;
  }
  if (result.errors.length > 0) {
    pushUpdateDebug("forced: purge reported errors", {
      errors: result.errors,
    });
    showPurgeErrors(result.errors);
    renderDebugPanel();
    // Do not trap users on the diagnostics screen forever. iOS may report a
    // non-fatal cache/SW failure even after enough cleanup has completed for the
    // next navigation to fetch the fresh app shell. Surface the errors briefly,
    // then continue the rescue reload automatically.
    setTimeout(reloadWithCacheBust, 2200);
    return;
  }
  pushUpdateDebug("forced: purge ok, reloading", {
    swUnregistered: result.swUnregistered,
    cachesDeleted: result.cachesDeleted,
    swReregistered: result.swReregistered,
  });
  reloadWithCacheBust();
}

/** Render purge failures inside the overlay and reset the button for a retry. */
function showPurgeErrors(errors: string[]): void {
  try {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    let box = document.getElementById(ERROR_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = ERROR_ID;
      box.style.cssText =
        "max-width:320px;width:100%;margin-top:4px;padding:12px 14px;border-radius:10px;" +
        "background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.35);" +
        "color:#b91c1c;font-size:12.5px;line-height:1.5;text-align:left";
      const btn = document.getElementById(`${OVERLAY_ID}-btn`);
      if (btn && btn.parentElement === overlay) {
        overlay.insertBefore(box, btn);
      } else {
        overlay.appendChild(box);
      }
    }
    const items = errors
      .map((e) => `<li style="margin:0 0 2px">${escapeHtml(e)}</li>`)
      .join("");
    box.innerHTML =
      `<strong style="display:block;margin-bottom:6px;color:#991b1b">We couldn't fully clear old app data</strong>` +
      `<ul style="margin:0;padding-left:18px">${items}</ul>` +
      `<p style="margin:8px 0 0;color:#7f1d1d">Tap “Try again”. If it keeps failing, fully close the app and reopen it.</p>`;

    const btn = document.getElementById(`${OVERLAY_ID}-btn`) as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Try again";
    }
  } catch {
    /* overlay must never throw */
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render (or refresh) the collapsible debug panel on the blocking overlay so an
 * iPhone user can read — and copy — the full update-flow trail: forced flag +
 * versions, purge attempts, and reload count. Survives reloads via
 * sessionStorage so the history isn't lost between cycles.
 */
function renderDebugPanel(): void {
  try {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    const cached = getVersionGateState();
    const header =
      `current=${CURRENT_APP_VERSION}\n` +
      `server=${cached?.server ?? "unknown"}\n` +
      `forced=${cached?.force ?? "unknown"}  stale=${cached?.stale ?? "unknown"}\n` +
      `reloadCount=${getRecoveryAttempts()}\n` +
      `ua=${navigator.userAgent}`;
    const text = `${header}\n\n${formatUpdateDebugLog()}`;

    let box = document.getElementById(DEBUG_ID);
    if (!box) {
      box = document.createElement("details");
      box.id = DEBUG_ID;
      box.style.cssText =
        "max-width:340px;width:100%;margin-top:8px;text-align:left;font-size:11px;color:#475569";
      box.innerHTML =
        `<summary style="cursor:pointer;font-size:12px;color:#7c3aed;font-weight:600;list-style:none">Show troubleshooting details</summary>` +
        `<pre id="${DEBUG_ID}-pre" style="margin:8px 0 0;padding:10px;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:rgba(15,23,42,0.05);border:1px solid rgba(15,23,42,0.12);border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;line-height:1.45"></pre>` +
        `<button id="${DEBUG_ID}-copy" type="button" style="margin-top:6px;padding:8px 14px;background:#e2e8f0;color:#1f2937;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Copy details</button>`;
      overlay.appendChild(box);
      const copyBtn = document.getElementById(`${DEBUG_ID}-copy`);
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          const pre = document.getElementById(`${DEBUG_ID}-pre`);
          const payload = pre?.textContent ?? "";
          try {
            void navigator.clipboard?.writeText(payload);
            copyBtn.textContent = "Copied!";
            setTimeout(() => {
              copyBtn.textContent = "Copy details";
            }, 1500);
          } catch {
            /* ignore clipboard failures */
          }
        });
      }
    }

    const pre = document.getElementById(`${DEBUG_ID}-pre`);
    if (pre) pre.textContent = text;
  } catch {
    /* debug panel must never break the overlay */
  }
}

function renderBlockingOverlay(manual: boolean): void {
  try {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      // Already painted (e.g. auto-mode first, now switching to manual). Just
      // upgrade it to the manual call-to-action instead of stacking overlays.
      if (manual) applyManualOverlayState();
      return;
    }
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
      <div id="${OVERLAY_ID}-spin" style="width:22px;height:22px;border:2px solid #7c3aed;border-top-color:transparent;border-radius:50%;animation:wfu .6s linear infinite"></div>
      <h2 id="${OVERLAY_ID}-h" style="font-size:20px;font-weight:700;margin:0">Updating Welile</h2>
      <p id="${OVERLAY_ID}-p" style="font-size:14px;color:#6b7280;margin:0;max-width:300px;line-height:1.5">
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
        // A button tap is a genuine user-activation, so this navigation is
        // revalidated against the network by WebKit — the one thing that beats
        // the iOS HTTP-cached shell that programmatic reloads cannot.
        void purgeThenReload();
      };
    }
    if (manual) applyManualOverlayState();
    renderDebugPanel();
  } catch {
    /* overlay must never throw */
  }
}

/**
 * Switch the overlay from the silent "installing automatically" state into the
 * explicit user-gesture call-to-action. Used after the automatic reload budget
 * is spent and the device is still serving the stale shell.
 */
function applyManualOverlayState(): void {
  try {
    const spin = document.getElementById(`${OVERLAY_ID}-spin`);
    if (spin) spin.style.display = "none";
    const h = document.getElementById(`${OVERLAY_ID}-h`);
    if (h) h.textContent = "Almost there — tap to finish";
    const p = document.getElementById(`${OVERLAY_ID}-p`);
    if (p) {
      p.textContent =
        "Your iPhone is holding onto an old copy of Welile. Tap the button below to load the latest version.";
    }
    const btn = document.getElementById(`${OVERLAY_ID}-btn`) as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Open latest version";
      // Pulse so the user notices the action is now on them.
      btn.style.boxShadow = "0 0 0 0 rgba(124,58,237,0.5)";
      btn.style.animation = "wfu-pulse 1.4s ease-in-out infinite";
      if (!document.getElementById(`${OVERLAY_ID}-pulse-style`)) {
        const st = document.createElement("style");
        st.id = `${OVERLAY_ID}-pulse-style`;
        st.textContent =
          "@keyframes wfu-pulse{0%{box-shadow:0 0 0 0 rgba(124,58,237,.45)}70%{box-shadow:0 0 0 12px rgba(124,58,237,0)}100%{box-shadow:0 0 0 0 rgba(124,58,237,0)}}";
        document.head.appendChild(st);
      }
    }
    pushUpdateDebug("forced: manual mode (auto-reload budget spent)", {
      forcedAutoReloads: forcedAutoReloadCount(),
      reload_attempts: getRecoveryAttempts(),
    });
    renderRecoveryInstructions();
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
  const cached = getVersionGateState();
  const autoOk = canAutoReload();
  pushUpdateDebug("forced: triggerForcedUpdate", {
    reason,
    forced: cached?.force ?? null,
    current: CURRENT_APP_VERSION,
    server: cached?.server ?? null,
    stale: cached?.stale ?? null,
    reload_attempts: getRecoveryAttempts(),
    forcedAutoReloads: forcedAutoReloadCount(),
    autoOk,
  });
  if (autoOk && cached?.current && cached.current !== CURRENT_APP_VERSION) {
    pushUpdateDebug("forced: cached version mismatch → immediate reload", {
      cachedCurrent: cached.current,
      current: CURRENT_APP_VERSION,
    });
    recordForcedAutoReload();
    reloadWithCacheBust();
    return;
  }
  forcing = true;
  logUpdateFailure("ios_version_gate", {
    chunk_mismatch: true,
    details: {
      forced: true,
      reason,
      ui: autoOk ? "forced_update_gate_auto" : "forced_update_gate_manual",
      forcedAutoReloads: forcedAutoReloadCount(),
    },
  });
  renderBlockingOverlay(!autoOk);
  if (autoOk) {
    // Auto-fire the update so the user never has to hunt for the button — but
    // only while we still have automatic-reload budget left. Mark the attempt
    // BEFORE reloading so the counter survives the navigation.
    recordForcedAutoReload();
    setTimeout(() => {
      void purgeThenReload();
    }, AUTO_TRIGGER_DELAY_MS);
  } else {
    // Auto-reload budget spent and still stale: stop looping. The static
    // "Open latest version" button now waits for a user gesture, which is the
    // only reliable way past the iOS HTTP-cached shell.
    logUpdateFailure("recovery_exhausted", {
      chunk_mismatch: true,
      reload_attempts: getRecoveryAttempts(),
      details: { ui: "forced_update_gate_manual", reason },
    });
  }
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
