import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Performance: Report Web Vitals in production
if (import.meta.env.PROD) {
  // Log long tasks for performance monitoring
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Log tasks that block the main thread for more than 50ms
          if (entry.duration > 50) {
            console.debug('[Performance] Long task:', entry.duration.toFixed(2), 'ms');
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // PerformanceObserver not supported
    }
  }
}

// Enable React concurrent features for better responsiveness
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register service worker for offline support (if available)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed - app still works
    });
  });
}
