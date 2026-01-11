import { createRoot } from "react-dom/client";

// Hide splash immediately
(window as any).hideSplash?.();

// Mount app - import CSS and App concurrently
Promise.all([
  import("./index.css"),
  import("./App.tsx")
]).then(([, { default: App }]) => {
  createRoot(document.getElementById('root')!).render(<App />);
});

// Chunk error recovery
const handleChunkError = () => {
  if (!sessionStorage.getItem('chunk_retry')) {
    sessionStorage.setItem('chunk_retry', '1');
    location.reload();
  }
};
addEventListener('vite:preloadError', handleChunkError);
addEventListener('unhandledrejection', e => {
  if (String((e as any).reason?.message || '').includes('dynamically imported')) handleChunkError();
});

// Service worker (production only, idle time)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  'requestIdleCallback' in window 
    ? requestIdleCallback(() => navigator.serviceWorker.register('/sw.js').catch(() => {}))
    : setTimeout(() => navigator.serviceWorker.register('/sw.js').catch(() => {}), 2000);
}

