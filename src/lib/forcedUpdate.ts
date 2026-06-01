// ============================================================================
// Universal refresh banner for stale app builds.
//
// `/version.json` is served with `Cache-Control: no-store`, so a fetch returns
// the freshest deployed value even when the current document was loaded from a
// browser cache. When the running bundle is older than the deployed build, we
// now show a dismissible top banner with an explicit Refresh action instead of
// blocking the whole app or auto-reloading in a loop.
// ============================================================================

import {
  purgeCachesAndServiceWorkers,
  reloadWithCacheBust,
  type PurgeResult,
} from "./hardRecovery";
import { checkServerVersion, CURRENT_APP_VERSION, getVersionGateState, isForceUpdateSync } from "./versionGate";
import { logUpdateFailure } from "./updateTelemetry";
import { getRecoveryAttempts } from "./hardRecovery";
import {
  pushUpdateDebug,
  formatUpdateDebugLog,
} from "./updateDebugLog";

const BANNER_ID = "welile-update-banner";
const ERROR_ID = `${BANNER_ID}-error`;
const DEBUG_ID = `${BANNER_ID}-debug`;
const POLL_INTERVAL_MS = 5 * 60_000;
const MIN_CHECK_INTERVAL_MS = 60_000;

let forcing = false;
let installed = false;
let lastCheckAt = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** True once a refresh prompt is active — other recovery paths should defer. */
export function isForcingUpdate(): boolean {
  return forcing;
}

/** Kept for compatibility with the previous recovery counter API. */
export function clearForcedAutoReloads(): void {
  try {
    localStorage.removeItem("welile_forced_auto_reloads");
  } catch {
    /* ignore */
  }
}

async function purgeThenReload(): Promise<void> {
  let result: PurgeResult;
  pushUpdateDebug("refresh-banner: purgeThenReload start", {
    reload_attempts: getRecoveryAttempts(),
  });
  try {
    result = await purgeCachesAndServiceWorkers();
  } catch (err) {
    pushUpdateDebug("refresh-banner: purge threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    showPurgeErrors([
      err instanceof Error ? err.message : "Unexpected error while clearing data",
    ]);
    renderDebugPanel();
    return;
  }

  if (result.errors.length > 0) {
    pushUpdateDebug("refresh-banner: purge reported errors", {
      errors: result.errors,
    });
    showPurgeErrors(result.errors);
    renderDebugPanel();
    setTimeout(reloadWithCacheBust, 2200);
    return;
  }

  pushUpdateDebug("refresh-banner: purge ok, reloading", {
    swUnregistered: result.swUnregistered,
    cachesDeleted: result.cachesDeleted,
    swReregistered: result.swReregistered,
  });
  reloadWithCacheBust();
}

function showPurgeErrors(errors: string[]): void {
  try {
    const banner = document.getElementById(BANNER_ID);
    if (!banner) return;

    let box = document.getElementById(ERROR_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = ERROR_ID;
      box.style.cssText =
        "grid-column:1/-1;margin-top:8px;padding:10px 12px;border-radius:10px;" +
        "background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.35);" +
        "color:#b91c1c;font-size:12px;line-height:1.45;text-align:left";
      banner.appendChild(box);
    }

    const items = errors
      .map((e) => `<li style=\"margin:0 0 2px\">${escapeHtml(e)}</li>`)
      .join("");
    box.innerHTML =
      `<strong style=\"display:block;margin-bottom:6px;color:#991b1b\">Refresh cleanup needs another try</strong>` +
      `<ul style=\"margin:0;padding-left:18px\">${items}</ul>`;

    const btn = document.getElementById(`${BANNER_ID}-btn`) as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Try refresh again";
    }
  } catch {
    /* banner must never throw */
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function renderDebugPanel(): void {
  try {
    const banner = document.getElementById(BANNER_ID);
    if (!banner) return;

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
        "grid-column:1/-1;margin-top:8px;text-align:left;font-size:11px;color:#475569";
      box.innerHTML =
        `<summary style=\"cursor:pointer;font-size:12px;color:#7c3aed;font-weight:600;list-style:none\">Show refresh details</summary>` +
        `<pre id=\"${DEBUG_ID}-pre\" style=\"margin:8px 0 0;padding:10px;max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:rgba(15,23,42,0.05);border:1px solid rgba(15,23,42,0.12);border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;line-height:1.45\"></pre>` +
        `<button id=\"${DEBUG_ID}-copy\" type=\"button\" style=\"margin-top:6px;padding:7px 12px;background:#e2e8f0;color:#1f2937;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer\">Copy details</button>`;
      banner.appendChild(box);

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
    /* debug panel must never break the banner */
  }
}

function renderRefreshBanner(reason: string): void {
  try {
    const existing = document.getElementById(BANNER_ID);
    if (existing) return;

    const banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.setAttribute("role", "alert");
    banner.setAttribute("aria-live", "polite");
    banner.style.cssText =
      "position:fixed;left:12px;right:12px;top:max(12px,env(safe-area-inset-top));z-index:2147483647;" +
      "display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:10px;" +
      "max-width:760px;margin:0 auto;padding:12px 12px 12px 14px;border-radius:14px;" +
      "background:#ffffff;color:#111827;border:1px solid rgba(124,58,237,0.28);" +
      "box-shadow:0 18px 40px rgba(15,23,42,0.18);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

    banner.innerHTML = `
      <div aria-hidden="true" style="width:34px;height:34px;border-radius:999px;background:rgba(124,58,237,0.12);color:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700">↻</div>
      <div style="min-width:0;text-align:left">
        <div style="font-size:14px;font-weight:700;line-height:1.25;margin:0">Refresh recommended</div>
        <div style="font-size:12.5px;color:#6b7280;line-height:1.35;margin-top:2px">A newer Welile version is ready. You can keep working, or refresh now to load the latest files.</div>
      </div>
      <button id="${BANNER_ID}-btn" type="button" style="min-height:38px;padding:0 16px;border:none;border-radius:999px;background:#7c3aed;color:#fff;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Refresh</button>
      <button id="${BANNER_ID}-close" type="button" aria-label="Dismiss refresh notice" style="width:34px;height:34px;border:none;border-radius:999px;background:rgba(15,23,42,0.06);color:#374151;font-size:20px;line-height:1;cursor:pointer">×</button>
      <style>
        @media(max-width:520px){#${BANNER_ID}{left:8px!important;right:8px!important;grid-template-columns:auto 1fr auto!important;gap:8px!important;padding:10px!important}#${BANNER_ID}-btn{grid-column:2/4;width:100%;margin-top:2px}#${BANNER_ID}-close{grid-column:3;grid-row:1}}
        @media(prefers-color-scheme:dark){#${BANNER_ID}{background:#0f172a!important;color:#f8fafc!important;border-color:rgba(167,139,250,.45)!important;box-shadow:0 18px 40px rgba(0,0,0,.38)!important}#${BANNER_ID} div div + div{color:#cbd5e1!important}#${BANNER_ID}-close{background:rgba(248,250,252,.12)!important;color:#f8fafc!important}}
      </style>`;

    document.body.appendChild(banner);

    const btn = document.getElementById(`${BANNER_ID}-btn`) as HTMLButtonElement | null;
    if (btn) {
      btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = "Refreshing…";
        void purgeThenReload();
      };
    }

    const close = document.getElementById(`${BANNER_ID}-close`) as HTMLButtonElement | null;
    if (close) {
      close.onclick = () => {
        banner.remove();
        pushUpdateDebug("refresh-banner: dismissed", { reason });
      };
    }

    renderDebugPanel();
  } catch {
    /* banner must never throw */
  }
}

export function triggerForcedUpdate(reason: string): void {
  if (forcing) return;
  forcing = true;
  const cached = getVersionGateState();
  pushUpdateDebug("refresh-banner: trigger", {
    reason,
    forced: cached?.force ?? null,
    current: CURRENT_APP_VERSION,
    server: cached?.server ?? null,
    stale: cached?.stale ?? null,
    reload_attempts: getRecoveryAttempts(),
  });

  logUpdateFailure("version_gate", {
    chunk_mismatch: true,
    details: {
      forced: cached?.force ?? null,
      reason,
      ui: "refresh_banner",
    },
  });

  renderRefreshBanner(reason);
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

export function installForcedUpdateWatch(): void {
  if (installed) return;
  installed = true;
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;

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
    /* refresh watch must never break the app */
  }
}
