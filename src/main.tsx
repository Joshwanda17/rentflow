import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Immediately hide splash - app is ready
const hideSplash = (window as any).hideSplash;
if (hideSplash) hideSplash();

// Mount app immediately
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Handle stale chunk errors gracefully
const handleChunkError = () => {
  const tried = sessionStorage.getItem('chunk_retry');
  if (!tried) {
    sessionStorage.setItem('chunk_retry', '1');
    window.location.reload();
  }
};

window.addEventListener('vite:preloadError', handleChunkError);
window.addEventListener('unhandledrejection', (e) => {
  if (String((e as any).reason?.message || '').includes('dynamically imported')) {
    handleChunkError();
  }
});

// Register service worker (production only, after load)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

