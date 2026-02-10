import { lazy, Suspense, useState, useEffect } from "react";
import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";
import { useForceRefresh } from "@/hooks/useForceRefresh";
import { useIOSCacheInvalidation } from "@/hooks/useIOSCacheInvalidation";

const PWAInstallPrompt = lazy(() => import("@/components/PWAInstallPrompt"));
const WhatsNewModal = lazy(() => import("@/components/WhatsNewModal").then(m => ({ default: m.WhatsNewModal })));
const GlobalSettingsToolbar = lazy(() => import("@/components/GlobalSettingsToolbar").then(m => ({ default: m.GlobalSettingsToolbar })));
const IOSOptimizations = lazy(() => import("@/components/IOSOptimizations"));
const IOSLinkHandler = lazy(() => import("@/components/IOSLinkHandler"));
const IOSShareReceiver = lazy(() => import("@/components/IOSShareReceiver"));

export default function DeferredExtras() {
  const [ready, setReady] = useState(false);

  // These hooks were previously in AppRoutes - moved here to defer loading
  useServiceWorkerUpdate();
  useForceRefresh();
  useIOSCacheInvalidation();

  // Delay rendering extras until after LCP — use idle callback for fastest possible
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
    <Suspense fallback={null}>
      <IOSOptimizations />
      <IOSLinkHandler />
      <IOSShareReceiver />
      <PWAInstallPrompt />
      <WhatsNewModal />
      <GlobalSettingsToolbar />
    </Suspense>
  );
}
