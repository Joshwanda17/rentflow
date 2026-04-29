import { useEffect, useCallback, useRef, useState } from "react";

declare const __BUILD_TIME__: number;

const CACHE_NAME = 'welile-v11';

// Pre-cache app shell assets for offline launch — runs ONLY on first install
async function precacheAppShell() {
  if (!("caches" in window)) return;
  
  // Skip if already precached this version (prevents redundant fetches on every load)
  const precacheKey = `precached_${CACHE_NAME}`;
  if (sessionStorage.getItem(precacheKey)) return;
  
  try {
    const cache = await caches.open(CACHE_NAME);
    
    // Cache the app shell (index.html) for offline SPA routing
    const response = await fetch('/');
    if (response.ok) {
      await cache.put('/', response.clone());
      await cache.put('/index.html', response);
      console.log("[SW] App shell cached for offline");
    }
    
    sessionStorage.setItem(precacheKey, '1');
  } catch (error) {
    console.warn("[SW] Failed to precache app shell:", error);
  }
}

export function useServiceWorkerUpdate() {
  const isReloading = useRef(false);
  const hasCheckedOnMount = useRef(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const flagUpdateReady = useCallback(() => {
    setUpdateReady(true);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const applyUpdate = useCallback(() => {
    if (isReloading.current) return;
    isReloading.current = true;

    console.log('[SW Update] User-initiated update, reloading...');

    // Tell waiting worker to take over
    const reg = registrationRef.current;
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    if ("caches" in window) {
      caches.keys().then((keys) => {
        Promise.all(keys.filter((k) => k.startsWith("welile-")).map((k) => caches.delete(k)));
      });
    }

    // Small delay to let SKIP_WAITING land before reload
    setTimeout(() => window.location.reload(), 100);
  }, []);

  const activateWaitingWorker = useCallback((reg: ServiceWorkerRegistration) => {
    if (reg.waiting) {
      console.log('[SW Update] Waiting worker present — prompting user.');
      flagUpdateReady();
    }
  }, [flagUpdateReady]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    // Controller change happens after we call applyUpdate -> SKIP_WAITING.
    // The reload is already scheduled by applyUpdate; nothing else to do.
    const onControllerChange = () => {
      console.log('[SW Update] Controller changed.');
    };

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        console.log('[SW Update] Received update message from SW');
        flagUpdateReady();
      }
    };

    const onUpdateFound = () => {
      if (!registration?.installing) return;

      console.log('[SW Update] New service worker installing...');
      const newWorker = registration.installing;

      newWorker.addEventListener("statechange", () => {
        console.log('[SW Update] Worker state:', newWorker.state);
        if (newWorker.state === "installed") {
          if (navigator.serviceWorker.controller) {
            console.log('[SW Update] New worker installed — prompting user.');
            flagUpdateReady();
          } else {
            console.log('[SW Update] First install - caching app shell for offline...');
            precacheAppShell();
          }
        }
      });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.addEventListener("message", onMessage);

    navigator.serviceWorker.ready.then((reg) => {
      registration = reg;
      registrationRef.current = reg;

      if (reg.waiting) {
        console.log('[SW Update] Found waiting worker on load');
        flagUpdateReady();
      }

      reg.addEventListener("updatefound", onUpdateFound);
    });

    // Check for updates frequently for real-time propagation
    const checkForUpdates = () => {
      if (registration) {
        registration.update().catch((err) => {
          console.log('[SW Update] Update check failed:', err);
        });
      }
    };
    
    // Check immediately on mount (only once)
    if (!hasCheckedOnMount.current) {
      hasCheckedOnMount.current = true;
      navigator.serviceWorker.ready.then((reg) => {
        reg.update().catch(() => {});
      });
    }
    
    // Check every 5 minutes (was 30s — cost optimization)
    const interval = setInterval(checkForUpdates, 5 * 60 * 1000);
    
    // Also check when the page becomes visible or gains focus
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdates();
      }
    };
    
    const onFocus = () => {
      checkForUpdates();
    };
    
    // Check when coming online
    const onOnline = () => {
      console.log('[SW Update] Back online, checking for updates...');
      checkForUpdates();
    };
    
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    // Check for version mismatch on load (for cross-tab/device updates)
    const storedBuildTime = localStorage.getItem("welile_build_time");
    const currentBuildTime = String(__BUILD_TIME__);
    
    if (storedBuildTime && storedBuildTime !== currentBuildTime) {
      console.log('[SW Update] Build time mismatch detected — prompting user.');
      localStorage.setItem("welile_build_time", currentBuildTime);
      flagUpdateReady();
    } else {
      localStorage.setItem("welile_build_time", currentBuildTime);
    }

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      registration?.removeEventListener("updatefound", onUpdateFound);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [flagUpdateReady, activateWaitingWorker]);

  return {
    updateReady: updateReady && !dismissed,
    applyUpdate,
    dismiss,
  };
}