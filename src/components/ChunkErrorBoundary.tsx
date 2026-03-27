import React, { Component, ReactNode } from "react";
import { RefreshCw, Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
  isRetrying: boolean;
}

class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isChunkError: false, isRetrying: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const msg = (error?.message || "").toLowerCase();
    const name = (error?.name || "").toLowerCase();
    
    const fullMsg = `${msg} ${name} ${(error?.stack || "").toLowerCase()}`;
    
    const isChunkError = 
      fullMsg.includes("failed to fetch dynamically imported module") ||
      fullMsg.includes("error loading dynamically imported module") ||
      fullMsg.includes("loading chunk") ||
      fullMsg.includes("loading css chunk") ||
      fullMsg.includes("dynamically imported") ||
      fullMsg.includes("unable to preload") ||
      fullMsg.includes("failed to load") ||
      fullMsg.includes("network error") ||
      fullMsg.includes("timeout") ||
      fullMsg.includes("chunkerror") ||
      fullMsg.includes("loaderror") ||
      fullMsg.includes("importing a module script failed");
    
    // Catch ALL errors — chunk errors get auto-retry, others get a friendly fallback
    return { hasError: true, isChunkError };
  }

  componentDidCatch(error: Error) {
    console.error("ChunkErrorBoundary caught:", error);
    // No auto-reload — user can pull-to-refresh or tap Retry
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
      // Chunk error — show "Updating" UI
      if (this.state.isChunkError) {
        return (
          <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background text-foreground p-6">
            <div className="flex flex-col items-center gap-6 max-w-sm text-center">
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
                  <><Loader2 className="w-4 h-4 animate-spin" /> Refreshing...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Retry Now</>
                )}
              </button>
              <p className="text-xs text-muted-foreground/60">
                If this keeps happening, try clearing your browser cache.
              </p>
            </div>
          </div>
        );
      }

      // General error — friendly fallback instead of blank screen
      return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background text-foreground p-6">
          <div className="flex flex-col items-center gap-6 max-w-sm text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Something went wrong</h1>
              <p className="text-muted-foreground text-sm">
                An unexpected error occurred. Please try refreshing the page.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium shadow-lg hover:opacity-90 transition-opacity"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Page
            </button>
            <p className="text-xs text-muted-foreground/60">
              If this keeps happening, try clearing your browser cache or contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChunkErrorBoundary;
