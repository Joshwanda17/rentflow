import { createRoot } from "react-dom/client";

const root = document.getElementById('root')!;

// Minimal spinner - no branching, no localStorage reads on critical path
root.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc"><div style="width:24px;height:24px;border:2px solid #7c3aed;border-top-color:transparent;border-radius:50%;animation:s .6s linear infinite"></div><style>@keyframes s{to{transform:rotate(360deg)}}</style></div>';

// Mount app immediately
const loadApp = async () => {
  try {
    const importsPromise = Promise.all([
      import("./index.css"),
      import("./App.tsx"),
    ]);

    // Show "still loading" after 8s grace period
    const showSlowTimer = setTimeout(() => {
      if (root.innerHTML.includes('animation:')) {
        root.innerHTML = `
          <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;gap:12px;padding:24px;text-align:center">
            <div style="width:32px;height:32px;border:3px solid #4ade80;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div>
            <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
            <h2 style="font-size:18px;font-weight:600;color:#1f2937;margin:0">Still loading…</h2>
            <p style="font-size:14px;color:#6b7280;margin:0;max-width:280px">Your network is slow. We'll keep trying.</p>
            <button onclick="location.reload()" style="padding:12px 24px;background:#4ade80;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;min-height:44px">Retry</button>
          </div>`;
      }
    }, 8000);

    const [, { default: App }] = await importsPromise;
    clearTimeout(showSlowTimer);
    createRoot(root).render(<App />);
  } catch (err) {
    console.error('[Main] App load failed:', err);
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-center;background:#fafafa;gap:16px;padding:24px;text-align:center">
        <h2 style="font-size:18px;font-weight:600;color:#1f2937;margin:0">Connection Error</h2>
        <p style="font-size:14px;color:#6b7280;margin:0">Tap to retry.</p>
        <button onclick="location.reload()" style="padding:12px 24px;background:#4ade80;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;min-height:44px">Retry</button>
      </div>`;
  }
};

loadApp();

// Chunk error recovery
addEventListener('vite:preloadError', () => {
  const k = 'chunk_retry';
  const c = parseInt(sessionStorage.getItem(k) || '0', 10);
  if (c < 2) { sessionStorage.setItem(k, String(c + 1)); location.reload(); }
});

addEventListener('unhandledrejection', e => {
  const msg = String((e as any).reason?.message || '').toLowerCase();
  if (msg.includes('dynamically imported') || msg.includes('failed to fetch') || msg.includes('loading chunk') || msg.includes('network error')) {
    const k = 'chunk_retry';
    const c = parseInt(sessionStorage.getItem(k) || '0', 10);
    if (c < 2) { sessionStorage.setItem(k, String(c + 1)); location.reload(); }
  }
});

// Defer service worker registration to after app mounts
if ('serviceWorker' in navigator) {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  } else {
    setTimeout(() => navigator.serviceWorker.register('/sw.js').catch(() => {}), 3000);
  }
}
