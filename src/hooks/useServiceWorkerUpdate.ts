import { useEffect, useCallback } from "react";
import { toast } from "sonner";

export function useServiceWorkerUpdate() {
  const handleUpdate = useCallback(() => {
    // Clear caches and reload
    if ("caches" in window) {
      caches.keys().then((keys) => {
        Promise.all(keys.filter((k) => k.startsWith("welile-")).map((k) => caches.delete(k)));
      });
    }
    window.location.reload();
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

    let registration: ServiceWorkerRegistration | null = null;

    const showUpdateToast = () => {
      toast("Update available", {
        description: "A new version is ready.",
        duration: Infinity,
        action: {
          label: "Refresh",
          onClick: handleUpdate,
        },
      });
    };

    const onControllerChange = () => {
      showUpdateToast();
    };

    const onUpdateFound = () => {
      if (!registration?.installing) return;

      const newWorker = registration.installing;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateToast();
        }
      });
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.ready.then((reg) => {
      registration = reg;

      if (reg.waiting) {
        showUpdateToast();
      }

      reg.addEventListener("updatefound", onUpdateFound);
    });

    const interval = setInterval(() => {
      registration?.update().catch(() => {});
    }, 60 * 60 * 1000);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      registration?.removeEventListener("updatefound", onUpdateFound);
      clearInterval(interval);
    };
  }, [handleUpdate]);
}
