import React, { Component, ReactNode } from "react";
import { RefreshCw, Loader2, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
  isRetrying: boolean;
  errorMessage: string;
}

const AUTO_RETRY_KEY = "welile_chunk_auto_retry_at";

function classifyChunkError(error: Error): boolean {
  const msg = (error?.message || "").toLowerCase();
  const name = (error?.name || "").toLowerCase();
  const stack = (error?.stack || "").toLowerCase();
  const full = `${msg} ${name} ${stack}`;

  // Explicit keyword matches
  const keywords = [
    "failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "loading chunk",
    "loading css chunk",
    "dynamically imported",
    "unable to preload",
    "failed to load",
    "failed to fetch",
    "network error",
    "networkerror",
    "timeout",
    "chunkerror",
    "loaderror",
    "importing a module script failed",
    "importing",
  ];
  if (keywords.some((k) => full.includes(k))) return true;

  // Stack mentions an asset URL — almost certainly a chunk/asset load failure
  if (/\/(assets|src)\/[^\s)]+\.(m?js|tsx?|css)/i.test(stack)) return true;

  // iOS Safari often throws bare TypeError with empty/short message on chunk fail
  if (name === "typeerror" && msg.length < 30) return true;

  return false;
}

class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      isChunkError: false,
      isRetrying: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const isChunkError = classifyChunkError(error);
    return {
      hasError: true,
      isChunkError,
      errorMessage: error?.message || error?.name || "Unknown error",
    };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("ChunkErrorBoundary caught:", error);

    // Best-effort remote log — never throw from here
    try {
      const payload = {
        pathname:
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : null,
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
        error_message: error?.message ?? "Unknown error",
        error_stack:
          (error?.stack || "") +
          "\n--- componentStack ---\n" +
          (info?.componentStack || ""),
        metadata: {
          source: "ChunkErrorBoundary",
          isChunkError: classifyChunkError(error),
          href: typeof window !== "undefined" ? window.location.href : null,
          online: typeof navigator !== "undefined" ? navigator.onLine : null,
          viewport:
            typeof window !== "undefined"
              ? { w: window.innerWidth, h: window.innerHeight }
              : null,
        },
      };
      supabase
        .from("public_error_logs")
        .insert(payload as any)
        .then(() => {}, () => {});
    } catch {
      // ignore
    }

    // Auto-retry once for chunk errors — clears caches/SWs then reloads.
    if (this.state.isChunkError || classifyChunkError(error)) {
      try {
        const last = Number(sessionStorage.getItem(AUTO_RETRY_KEY) || "0");
        const now = Date.now();
        // Only auto-retry if we haven't tried in the last 60s (prevents reload loops)
        if (now - last > 60_000) {
          sessionStorage.setItem(AUTO_RETRY_KEY, String(now));
          setTimeout(() => {
            this.handleRetry();
          }, 1500);
        }
      } catch {
        // sessionStorage blocked — skip auto-retry, user can tap button
      }
    }
  }

  handleRetry = async () => {
    this.setState({ isRetrying: true });

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.startsWith("welile-"))
            .map((k) => caches.delete(k))
        );
      }

      localStorage.removeItem("welile_chunk_recovery_attempted");
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  handleGoHome = () => {
    try {
      sessionStorage.removeItem(AUTO_RETRY_KEY);
    } catch {
      // ignore
    }
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      // Chunk error — auto-recovering "Updating" UI
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

      // Generic app error — friendly fallback with Home + Refresh + diagnostics
      return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background text-foreground p-6">
          <div className="flex flex-col items-center gap-6 max-w-sm text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Something went wrong</h1>
              <p className="text-muted-foreground text-sm">
                An unexpected error occurred. You can refresh or head back home.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium shadow-lg hover:opacity-90 transition-opacity"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-muted text-foreground font-medium hover:bg-muted/80 transition-colors"
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>
            </div>
            {this.state.errorMessage && (
              <details className="w-full text-left">
                <summary className="text-xs text-muted-foreground/60 cursor-pointer">
                  Technical details
                </summary>
                <p className="mt-2 text-xs text-muted-foreground/70 break-words font-mono bg-muted/40 p-2 rounded">
                  {this.state.errorMessage}
                </p>
              </details>
            )}
            <p className="text-xs text-muted-foreground/60">
              If this keeps happening, contact support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ChunkErrorBoundary;
