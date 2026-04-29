import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";

/**
 * Behavior-only component. Renders a persistent sonner toast when a new
 * deployed version is detected, letting the user reload at a safe moment
 * instead of being silently force-reloaded mid-action.
 */
export default function UpdateAvailableToast() {
  const { updateReady, applyUpdate, dismiss } = useServiceWorkerUpdate();
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!updateReady) {
      if (toastIdRef.current !== null) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
      return;
    }

    if (toastIdRef.current !== null) return;

    toastIdRef.current = toast("New version available", {
      description: "Reload to get the latest fixes.",
      duration: Infinity,
      action: {
        label: "Update now",
        onClick: () => applyUpdate(),
      },
      cancel: {
        label: "Later",
        onClick: () => dismiss(),
      },
    });
  }, [updateReady, applyUpdate, dismiss]);

  return null;
}