import { useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

declare const __BUILD_TIME__: number;

export function useServiceWorkerUpdate() {
  const isReloading = useRef(false);

  const handleUpdate = useCallback(() => {
    if (isReloading.current) return;
    isReloading.current = true;

    // Clear caches and reload
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

    // Auto-refresh when new service worker takes control
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      
      toast.success("App updated!", {
        description: "Refreshing to apply changes...",
        duration: 2000,
      });
      
      setTimeout(() => handleUpdate(), 1500);
    };

    const onUpdateFound = () => {
      if (!registration?.installing) return;

      const newWorker = registration.installing;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          // Auto-activate the new worker immediately
          toast.info("New version available", {
            description: "Updating automatically...",
            duration: 2000,
          });
          
          // Tell the waiting worker to skip waiting and become active
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

    // Check for updates more frequently (every 30 seconds)
    const checkForUpdates = () => {
      registration?.update().catch(() => {});
    };
    
    const interval = setInterval(checkForUpdates, 30 * 1000);
    
    // Also check when the page becomes visible
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdates();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Check for version mismatch on focus (for cross-tab updates)
    const storedBuildTime = localStorage.getItem("welile_build_time");
    const currentBuildTime = String(__BUILD_TIME__);
    
    if (storedBuildTime && storedBuildTime !== currentBuildTime) {
      // New version detected, trigger update
      localStorage.setItem("welile_build_time", currentBuildTime);
      handleUpdate();
    } else {
      localStorage.setItem("welile_build_time", currentBuildTime);
    }

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      registration?.removeEventListener("updatefound", onUpdateFound);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, [handleUpdate, activateWaitingWorker]);
}
