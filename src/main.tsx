import { createRoot } from "react-dom/client";

const root = document.getElementById('root')!;

// Show branded loader immediately — inline SVG spinner, no network requests at all
root.innerHTML = `<div style="min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;gap:12px">
  <div style="width:20px;height:20px;border:2px solid #7c3aed;border-top-color:transparent;border-radius:50%;animation:s .6s linear infinite"></div>
  <style>@keyframes s{to{transform:rotate(360deg)}}@media(prefers-color-scheme:dark){div[style*=f8fafc]{background:#0f172a!important}}</style>
</div>`;

// Mount app
const loadApp = async () => {
  try {
    const [, { default: App }] = await Promise.all([
      import("./index.css"),
      import("./App.tsx"),
    ]);
    
    createRoot(root).render(<App />);
  } catch (err) {
    console.error('[Main] App load failed:', err);
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;gap:16px;padding:24px;text-align:center">
        <img src="/welile-logo.png" alt="Welile" width="48" height="48" style="border-radius:12px" />
        <h2 style="font-size:18px;font-weight:600;color:#1f2937;margin:0">Connection Error</h2>
        <p style="font-size:14px;color:#6b7280;margin:0;max-width:280px">Check your internet connection and try again.</p>
        <button onclick="location.reload()" style="padding:12px 24px;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;min-height:44px">Tap to Retry</button>
      </div>`;
  }
};

loadApp();

// Show retry UI after 8s on slow networks
setTimeout(() => {
  if (root.innerHTML.includes('animation:')) {
    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Tap to Retry';
    retryBtn.onclick = () => location.reload();
    retryBtn.style.cssText = 'padding:12px 24px;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;min-height:44px;margin-top:8px';
    root.firstElementChild?.appendChild(retryBtn);
  }
}, 8000);

// Chunk error recovery — auto-retry on dynamic import failures
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

// Register service worker — fast (1s fallback) for offline support
if ('serviceWorker' in navigator) {
  const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(register);
  } else {
    setTimeout(register, 1000);
  }
}