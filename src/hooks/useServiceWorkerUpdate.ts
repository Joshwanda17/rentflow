import { useEffect, useCallback, useRef } from "react";

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

  const handleUpdate = useCallback(() => {
    if (isReloading.current) return;
    isReloading.current = true;

    console.log('[SW Update] New version detected, updating...');

    // Clear caches and reload silently
    if ("caches" in window) {
      caches.keys().then((keys) => {
        Promise.all(keys.filter((k) => k.startsWith("welile-")).map((k) => caches.delete(k)));
      });
    }
    
    // Force reload bypassing cache
    window.location.reload();
  }, []);

  const activateWaitingWorker = useCallback((reg: ServiceWorkerRegistration) => {
    if (reg.waiting) {
      console.log('[SW Update] Activating waiting worker...');
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let refreshing = false;

    // Auto-refresh immediately when new service worker takes control
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      console.log('[SW Update] Controller changed, refreshing...');
      handleUpdate();
    };

    // Listen for messages from service worker
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATED') {
        console.log('[SW Update] Received update message from SW');
        if (!refreshing) {
          refreshing = true;
          handleUpdate();
        }
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
            // New worker ready, activate immediately
            console.log('[SW Update] New worker installed, activating...');
            activateWaitingWorker(registration!);
          } else {
            // First install - cache app shell for offline
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

      // If there's already a waiting worker, activate it immediately
      if (reg.waiting) {
        console.log('[SW Update] Found waiting worker on load');
        activateWaitingWorker(reg);
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
      // New version detected, trigger update immediately
      console.log('[SW Update] Build time mismatch detected');
      localStorage.setItem("welile_build_time", currentBuildTime);
      handleUpdate();
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
  }, [handleUpdate, activateWaitingWorker]);
}