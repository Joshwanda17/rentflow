import { useEffect, useCallback, useState } from "react";
import { clearAndReload } from "@/lib/hardRecovery";

declare const __CACHE_VERSION__: string;

// Persist dismissal for the duration of the session, keyed to the cache
// version. Once the user dismisses, we won't re-prompt on focus/resume — only
// a genuinely new __CACHE_VERSION__ release clears this.
const DISMISS_KEY = 'welile_update_dismissed_version';

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

  return {
    updateReady: updateReady && !dismissed,
    applyUpdate,
    dismiss,
  };
}