import { lazy, Suspense, useState, useEffect, Component, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { useForceRefresh } from "@/hooks/useForceRefresh";
import { useIOSCacheInvalidation } from "@/hooks/useIOSCacheInvalidation";
import { useAuth } from "@/hooks/useAuth";

const IOSOptimizations = lazy(() => import("@/components/IOSOptimizations"));
const IOSLinkHandler = lazy(() => import("@/components/IOSLinkHandler"));
const IOSShareReceiver = lazy(() => import("@/components/IOSShareReceiver"));

class ExtrasBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    console.warn('[DeferredExtras] Non-critical component failed:', error.message);
  }
  render() { return this.state.hasError ? null : this.props.children; }
}

export default function DeferredExtras() {
  const [ready, setReady] = useState(false);
  const { pathname } = useLocation();

  useServiceWorkerUpdate();
  useForceRefresh();
  useIOSCacheInvalidation();

  const { user } = useAuth();

  useEffect(() => {
    const activate = () => setReady(true);
    if ('requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(activate, { timeout: 1500 });
      return () => (window as any).cancelIdleCallback(id);
    }
    const timer = setTimeout(activate, 1000);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) return null;

  return (
    <ExtrasBoundary>
      <Suspense fallback={null}>
        <IOSOptimizations />
        <IOSLinkHandler />
        <IOSShareReceiver />
      </Suspense>
    </ExtrasBoundary>
  );
}
