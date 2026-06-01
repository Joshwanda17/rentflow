import { RefreshCw, X } from "lucide-react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";

/**
 * Behavior-only component. Renders a persistent sonner toast when a new
 * deployed version is detected, letting the user reload at a safe moment
 * instead of being silently force-reloaded mid-action.
 */
export default function UpdateAvailableToast() {
  const { updateReady, applyUpdate, dismiss } = useServiceWorkerUpdate();

  if (!updateReady) return null;

  return (
    <div className="fixed left-3 right-3 top-3 z-[9999] mx-auto max-w-3xl rounded-xl border border-primary/25 bg-background p-3 text-foreground shadow-xl sm:top-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <RefreshCw className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Refresh recommended</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            A newer Welile version is ready. You can keep working, or refresh now to load the latest files.
          </p>
        </div>
        <button
          type="button"
          onClick={applyUpdate}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss refresh notice"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}