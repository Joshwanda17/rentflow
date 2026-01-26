import { createRoot } from "react-dom/client";

// Show loading state immediately
const root = document.getElementById('root')!;
root.innerHTML = `
  <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fafafa;gap:12px">
    <div style="width:32px;height:32px;border:3px solid #4ade80;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  </div>
`;

// Hide splash if exists
(window as any).hideSplash?.();

// Mount app with timeout protection
const loadApp = async () => {
  try {
    const [, { default: App }] = await Promise.race([
      Promise.all([
        import("./index.css"),
        import("./App.tsx")
      ]),
      // Timeout after 15 seconds
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Load timeout')), 15000)
      )
    ]);
    
    createRoot(root).render(<App />);
  } catch (err) {
    console.error('[Main] App load failed:', err);
    // Show retry UI on load failure
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fafafa;gap:16px;padding:24px;text-align:center">
        <div style="width:48px;height:48px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </div>
        <h2 style="font-size:18px;font-weight:600;color:#1f2937;margin:0">Connection Issue</h2>
        <p style="font-size:14px;color:#6b7280;margin:0;max-width:280px">Please check your internet connection and try again.</p>
        <button onclick="location.reload()" style="padding:12px 24px;background:#4ade80;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;min-height:44px">
          Retry
        </button>
      </div>
    `;
  }
};

loadApp();

// Enhanced chunk error recovery
const handleChunkError = () => {
  const retryKey = 'chunk_retry';
  const retryCount = parseInt(sessionStorage.getItem(retryKey) || '0', 10);
  
  if (retryCount < 2) {
    sessionStorage.setItem(retryKey, String(retryCount + 1));
    location.reload();
  }
};

addEventListener('vite:preloadError', handleChunkError);
addEventListener('unhandledrejection', e => {
  const msg = String((e as any).reason?.message || '').toLowerCase();
  if (
    msg.includes('dynamically imported') ||
    msg.includes('failed to fetch') ||
    msg.includes('loading chunk') ||
    msg.includes('network error')
  ) {
    handleChunkError();
  }
});

// Service worker (production only, idle time)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  'requestIdleCallback' in window 
    ? requestIdleCallback(() => navigator.serviceWorker.register('/sw.js').catch(() => {}))
    : setTimeout(() => navigator.serviceWorker.register('/sw.js').catch(() => {}), 2000);
}

