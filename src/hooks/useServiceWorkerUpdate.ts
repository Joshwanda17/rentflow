import { useEffect, useCallback, useRef } from "react";

declare const __BUILD_TIME__: number;

// Pre-cache app shell assets for offline launch
async function precacheAppShell() {
  if (!("caches" in window)) return;
  
  try {
    const cache = await caches.open("welile-v8");
    
    // Cache the current page (app shell)
    const currentUrl = window.location.href;
    const response = await fetch(currentUrl);
    if (response.ok) {
      await cache.put(currentUrl, response.clone());
      await cache.put("/", response.clone());
      await cache.put("/index.html", response);
      console.log("[SW] App shell cached for offline");
    }
    
    // Also cache critical routes
    const criticalRoutes = ["/dashboard", "/auth", "/settings"];
    for (const route of criticalRoutes) {
      try {
        const routeResponse = await fetch(route);
        if (routeResponse.ok) {
          await cache.put(route, routeResponse);
        }
      } catch (e) {
        // Ignore individual route failures
      }
    }
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
    
    // Check immediately on mount (only once) and precache app shell
    if (!hasCheckedOnMount.current) {
      hasCheckedOnMount.current = true;
      navigator.serviceWorker.ready.then((reg) => {
        reg.update().catch(() => {});
      });
      
      // Pre-cache app shell for offline on every app load
      precacheAppShell();
    }
    
    // Check every 3 seconds for instant feature propagation
    const interval = setInterval(checkForUpdates, 3 * 1000);
    
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