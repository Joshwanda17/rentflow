import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  children: ReactNode;
  /** Friendly role label shown in the fallback, e.g. "agent dashboard". */
  label?: string;
  /** When this value changes, the boundary automatically clears its error state. */
  resetKey?: string | number;
  /**
   * Called when the user clicks "Try again". Use this to refetch data,
   * invalidate caches, etc. Boundary state is cleared after this resolves.
   */
  onReset?: () => void | Promise<void>;
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
export class DashboardErrorBoundaryInner extends Component<Props, State> {
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

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: undefined });
    }
  }

  handleTryAgain = async () => {
    try {
      await this.props.onReset?.();
    } catch (err) {
      console.error('[DashboardErrorBoundary] onReset failed:', err);
    }
    this.setState({ hasError: false, message: undefined });
  };

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
                  onClick={this.handleTryAgain}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
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

/**
 * Route-aware wrapper: forwards the current pathname as `resetKey`, so the
 * boundary clears its error state automatically when the user navigates away.
 */
export function DashboardErrorBoundary(props: Props) {
  const location = useLocation();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const autoKey = `${location.pathname}|${user?.id ?? 'anon'}|${role ?? 'none'}`;
  const handleReset = async () => {
    if (props.onReset) {
      await props.onReset();
      return;
    }
    // Default: invalidate all React Query caches so the dashboard refetches
    // fresh data when it re-mounts after the boundary clears.
    await queryClient.invalidateQueries();
  };
  return (
    <DashboardErrorBoundaryInner
      {...props}
      resetKey={props.resetKey ?? autoKey}
      onReset={handleReset}
    />
  );
}

export default DashboardErrorBoundary;