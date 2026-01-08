import React, { Component, ReactNode } from "react";
import { RefreshCw, Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isRetrying: boolean;
}

class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isRetrying: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> | null {
    // Detect chunk/dynamic import failures
    const msg = error?.message || "";
    if (
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Loading chunk") ||
      msg.includes("Loading CSS chunk")
    ) {
      return { hasError: true };
    }
    return null;
  }

  componentDidCatch(error: Error) {
    console.error("ChunkErrorBoundary caught:", error);
  }

  handleRetry = async () => {
    this.setState({ isRetrying: true });

    try {
      // Clear service worker and caches
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k.startsWith("welile-")).map((k) => caches.delete(k))
        );
      }

      // Clear recovery flag so main.tsx doesn't block
      localStorage.removeItem("welile_chunk_recovery_attempted");

      // Hard reload to get fresh assets
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background text-foreground p-6">
          <div className="flex flex-col items-center gap-6 max-w-sm text-center">
            {/* Animated loader */}
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-muted animate-pulse" />
              <Loader2 className="absolute inset-0 m-auto w-8 h-8 text-primary animate-spin" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Updating...</h1>
              <p className="text-muted-foreground text-sm">
                A newer version is available. Please wait while we refresh the app.
              </p>
            </div>

            <button
              onClick={this.handleRetry}
              disabled={this.state.isRetrying}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {this.state.isRetrying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Retry Now
                </>
              )}
            </button>

            <p className="text-xs text-muted-foreground/60">
              If this keeps happening, try clearing your browser cache.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChunkErrorBoundary;
