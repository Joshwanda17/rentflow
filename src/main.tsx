import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Trigger splash screen hide (respects 3-second minimum)
const win = window as unknown as { hideSplash?: () => void };
if (win.hideSplash) {
  win.hideSplash();
}

// IMPORTANT: prevent "invalid hook call" / blank screens caused by stale cached JS chunks.
// In preview/dev we hard-reset any existing service worker + caches once.
(async () => {
  const recoverFromStaleChunks = async () => {
    try {
      const attempted = localStorage.getItem('welile_chunk_recovery_attempted') === 'true';
      if (attempted) return;
      localStorage.setItem('welile_chunk_recovery_attempted', 'true');

      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }

      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('welile-')).map((k) => caches.delete(k)));
      }

      // Reload once to ensure the app boots with a consistent bundle set.
      window.location.reload();
    } catch {
      // ignore
    }
  };

  // If a dynamic import chunk is missing (common after deploy with cached HTML), recover automatically.
  const onChunkError = (reason: unknown) => {
    const msg =
      typeof reason === 'string'
        ? reason
        : (reason as any)?.message || (reason as any)?.reason?.message || '';

    if (String(msg).includes('Failed to fetch dynamically imported module')) {
      recoverFromStaleChunks();
    }
  };

  // Vite-specific event (covers preload failures)
  window.addEventListener('vite:preloadError', () => recoverFromStaleChunks());
  window.addEventListener('unhandledrejection', (e) => onChunkError((e as any).reason));
  window.addEventListener('error', (e) => onChunkError((e as any).error || (e as any).message));

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
  createRoot(document.getElementById('root')!).render(
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

