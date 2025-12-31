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

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      
      console.debug('[SW] Service Worker registered:', registration.scope);
      
      // Check for updates periodically (every 5 minutes)
      setInterval(() => {
        registration.update();
      }, 5 * 60 * 1000);
      
    } catch (error) {
      console.debug('[SW] Service Worker registration failed:', error);
    }
  });
}
