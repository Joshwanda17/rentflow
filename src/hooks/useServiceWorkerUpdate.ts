import { useEffect, useCallback, useState } from "react";
import { clearAndReload } from "@/lib/hardRecovery";
import { checkServerVersion } from "@/lib/versionGate";

declare const __CACHE_VERSION__: string;

// Persist dismissal for the duration of the session, keyed to the cache
// version. Once the user dismisses, we won't re-prompt on focus/resume — only
// a genuinely new __CACHE_VERSION__ release clears this.
const DISMISS_KEY = 'welile_update_dismissed_version';

// How often to actively poll the deployed `/version.json` while the app is
// open and visible. Keeps the "new build available" prompt timely without
// hammering the network.
const POLL_INTERVAL_MS = 60_000;

export function useServiceWorkerUpdate() {
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === __CACHE_VERSION__;
    } catch {
      return false;
    }
  });
  const flagUpdateReady = useCallback(() => {
    setUpdateReady(true);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, __CACHE_VERSION__);
    } catch {
      /* ignore storage failures */
    }
  }, []);

  const applyUpdate = useCallback(() => {
    void clearAndReload("manual_reload");
  }, []);

  useEffect(() => {
    // Check for version mismatch on load (for cross-tab/device updates)
    const storedCacheVersion = localStorage.getItem("welile_cache_version");
    const currentCacheVersion = __CACHE_VERSION__;
    
    if (storedCacheVersion && storedCacheVersion !== currentCacheVersion) {
      console.log('[SW Update] Cache version mismatch detected — prompting user.');
      localStorage.setItem("welile_cache_version", currentCacheVersion);
      flagUpdateReady();
    } else {
      localStorage.setItem("welile_cache_version", currentCacheVersion);
    }
  }, [flagUpdateReady]);

  // Actively detect freshly deployed builds by comparing the running bundle
  // against the network `/version.json` (served `no-store`). Runs on mount,
  // on a light interval, and whenever the app returns to the foreground —
  // so an agent who leaves the app open still gets prompted to refresh.
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const state = await checkServerVersion();
        if (!cancelled && state.stale) {
          flagUpdateReady();
        }
      } catch {
        /* network/version failures must never surface to the user */
      }
    };

    void check();
    const interval = window.setInterval(check, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [flagUpdateReady]);

  return {
    updateReady: updateReady && !dismissed,
    applyUpdate,
    dismiss,
  };
}