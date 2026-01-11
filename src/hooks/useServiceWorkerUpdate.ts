import { useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

declare const __BUILD_TIME__: number;

export function useServiceWorkerUpdate() {
  const isReloading = useRef(false);

  const handleUpdate = useCallback(() => {
    if (isReloading.current) return;
    isReloading.current = true;

    // Clear caches and reload silently
    if ("caches" in window) {
      caches.keys().then((keys) => {
        Promise.all(keys.filter((k) => k.startsWith("welile-")).map((k) => caches.delete(k)));
      });
    }
    window.location.reload();
  }, []);

  const activateWaitingWorker = useCallback((reg: ServiceWorkerRegistration) => {
    if (reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

    let registration: ServiceWorkerRegistration | null = null;
    let refreshing = false;

    // Auto-refresh immediately when new service worker takes control
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      
      // Silent auto-update - just refresh without user interaction
      handleUpdate();
    };

    const onUpdateFound = () => {
      if (!registration?.installing) return;

      const newWorker = registration.installing;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          // Auto-activate the new worker immediately without prompt
          activateWaitingWorker(registration!);
        }
      });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.ready.then((reg) => {
      registration = reg;

      // If there's already a waiting worker, activate it immediately
      if (reg.waiting) {
        activateWaitingWorker(reg);
      }

      reg.addEventListener("updatefound", onUpdateFound);
    });

    // Check for updates every 5 seconds for instant propagation
    const checkForUpdates = () => {
      registration?.update().catch(() => {});
    };
    
    // Check immediately on load
    checkForUpdates();
    
    const interval = setInterval(checkForUpdates, 5 * 1000);
    
    // Also check when the page becomes visible or gains focus
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdates();
      }
    };
    
    const onFocus = () => {
      checkForUpdates();
    };
    
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    // Check for version mismatch on load (for cross-tab/device updates)
    const storedBuildTime = localStorage.getItem("welile_build_time");
    const currentBuildTime = String(__BUILD_TIME__);
    
    if (storedBuildTime && storedBuildTime !== currentBuildTime) {
      // New version detected, trigger update immediately
      localStorage.setItem("welile_build_time", currentBuildTime);
      handleUpdate();
    } else {
      localStorage.setItem("welile_build_time", currentBuildTime);
    }

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      registration?.removeEventListener("updatefound", onUpdateFound);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [handleUpdate, activateWaitingWorker]);
}
