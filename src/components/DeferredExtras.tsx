import { lazy, Suspense, useState, useEffect, Component, ReactNode, ErrorInfo } from "react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { useForceRefresh } from "@/hooks/useForceRefresh";
import { useIOSCacheInvalidation } from "@/hooks/useIOSCacheInvalidation";

const PWAInstallPrompt = lazy(() => import("@/components/PWAInstallPrompt"));
const WhatsNewModal = lazy(() => import("@/components/WhatsNewModal").then(m => ({ default: m.WhatsNewModal })));
// GlobalSettingsToolbar moved to FloatingToolbar
const IOSOptimizations = lazy(() => import("@/components/IOSOptimizations"));
const IOSLinkHandler = lazy(() => import("@/components/IOSLinkHandler"));
const IOSShareReceiver = lazy(() => import("@/components/IOSShareReceiver"));

// Error boundary to prevent deferred extras from crashing the entire app
class ExtrasBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[DeferredExtras] Non-critical component failed:', error.message);
  }
  render() { return this.state.hasError ? null : this.props.children; }
}

export default function DeferredExtras() {
  const [ready, setReady] = useState(false);

  useServiceWorkerUpdate();
  useForceRefresh();
  useIOSCacheInvalidation();

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
        <PWAInstallPrompt />
        <WhatsNewModal />
        {/* GlobalSettingsToolbar now in FloatingToolbar */}
      </Suspense>
    </ExtrasBoundary>
  );
}
