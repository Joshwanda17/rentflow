import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Friendly role label shown in the fallback, e.g. "agent dashboard". */
  label?: string;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Full-screen error boundary for a role dashboard. Prevents a single render
 * error inside the dashboard subtree from blanking out the whole app — instead
 * the user sees a readable message with Reload / Sign out actions.
 */
export class DashboardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(
      `[DashboardErrorBoundary] ${this.props.label ?? 'dashboard'} crashed:`,
      error,
      info.componentStack,
    );
  }

  handleReload = () => {
    try { window.location.reload(); } catch { /* ignore */ }
  };

  handleHardReload = () => {
    try {
      // Clear caches that commonly cause stuck broken states for field agents.
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('agent-listings:') || k.startsWith('welile-')) {
          try { localStorage.removeItem(k); } catch { /* ignore */ }
        }
      });
    } catch { /* ignore */ }
    try { window.location.href = '/'; } catch { /* ignore */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        className="min-h-screen w-full flex items-center justify-center bg-background px-5 py-10"
      >
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                Your {this.props.label ?? 'dashboard'} couldn't load
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Something went wrong while loading this page. Your data is safe — please reload to try again.
              </p>
              {this.state.message && (
                <p className="mt-2 text-xs text-muted-foreground break-words">
                  Details: {this.state.message}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload
                </button>
                <button
                  type="button"
                  onClick={this.handleHardReload}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Clear cache &amp; restart
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default DashboardErrorBoundary;