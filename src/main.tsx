import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Hide initial loader
const loader = document.getElementById('app-loader');
if (loader) loader.style.display = 'none';

// IMPORTANT: prevent "invalid hook call" caused by stale cached JS chunks.
// In preview/dev we hard-reset any existing service worker + caches once.
(async () => {
  try {
    const alreadyReset = sessionStorage.getItem('welile_sw_reset_done') === 'true';
    const isProd = import.meta.env.PROD;

    if (!isProd && !alreadyReset && 'serviceWorker' in navigator) {
      sessionStorage.setItem('welile_sw_reset_done', 'true');

      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));

      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('welile-')).map((k) => caches.delete(k)));
      }

      // Reload once to ensure the app boots with a consistent bundle set.
      window.location.reload();
      return;
    }
  } catch {
    // ignore
  }

  // Mount app
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
})();

// Register service worker after load (production only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
