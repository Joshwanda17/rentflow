import { createRoot } from 'react-dom/client';

const root = document.getElementById('root')!;
const host = window.location.hostname;
const isPreviewHost =
  host.includes('id-preview--') ||
  host.includes('preview--') ||
  host.endsWith('.lovableproject.com');

// Show branded loader immediately — inline SVG spinner, no network requests at all
root.innerHTML = `<div style="min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;gap:12px">
  <div style="width:20px;height:20px;border:2px solid #7c3aed;border-top-color:transparent;border-radius:50%;animation:s .6s linear infinite"></div>
  <style>@keyframes s{to{transform:rotate(360deg)}}@media(prefers-color-scheme:dark){div[style*=f8fafc]{background:#0f172a!important}}</style>
</div>`;

// Detect devices prone to backdrop-filter GPU corruption (horizontal tearing on
// blurred surfaces). Affects many mid/low-end Android phones (Tecno, Infinix,
// older Samsung Mali GPUs). Flag the document so CSS can swap blur → opaque.
try {
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const mem = (navigator as any).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const userForced = localStorage.getItem('welile-no-blur') === '1';
  // Android 12-14 Chrome / Samsung Internet are the documented victims of
  // the Mali/Adreno backdrop-filter + sticky-in-transform compositor bug
  // (rainbow tearing band + duplicated rows). Flag them all, regardless of RAM.
  const androidVerMatch = ua.match(/Android\s+(\d+)/i);
  const androidVer = androidVerMatch ? parseInt(androidVerMatch[1], 10) : 0;
  const isSamsungBrowser = /SamsungBrowser/i.test(ua);
  const isAndroidChromeWebView = isAndroid && /Chrome|wv/i.test(ua);
  const isAffectedAndroid =
    isAndroid && androidVer >= 12 && androidVer <= 14 &&
    (isSamsungBrowser || isAndroidChromeWebView);
  if (userForced || isAffectedAndroid || (isAndroid && (mem <= 4 || cores <= 4))) {
    document.documentElement.classList.add('no-backdrop-blur');
    if (isAffectedAndroid) {
      document.documentElement.classList.add('android-compositor-safe');
    }
  }
} catch {}

// Unregister service workers in preview/iframe to prevent stale cache issues
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

// Clear app caches in background — never blocks startup, never touches auth
const clearAppCaches = () => {
  try {
    if ('caches' in window) {
      caches.keys().then(keys =>
        Promise.all((isPreviewHost ? keys : keys.filter(k => k.startsWith('welile-'))).map(k => caches.delete(k)))
      ).catch(() => {});
    }
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
    }
  } catch {}
};

// Preview-only watchdog: if app mounts into an invisible/empty state, show recovery UI
const hasVisibleAppContent = () => {
  try {
    const elements = Array.from(root.querySelectorAll('*')) as HTMLElement[];
    return elements.some((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
  } catch {
    return false;
  }
};

const schedulePreviewBlankPageGuard = () => {
  if (!isPreviewHost) return;

  const check = () => {
    requestAnimationFrame(() => {
      if (!hasVisibleAppContent()) {
        console.error('[Main] Preview blank-page guard triggered');
        showErrorUI();
      }
    });
  };

  setTimeout(check, 7000);
  setTimeout(check, 14000);
};

// Mount app immediately — cache clearing runs in background
const loadApp = async () => {
  // In preview, clear immediately for self-healing; elsewhere do it idle
  if (isPreviewHost) {
    clearAppCaches();
  } else if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(clearAppCaches);
  } else {
    setTimeout(clearAppCaches, 2000);
  }
  try {
    // Hard timeout: if imports hang >12s, reject so we show error UI
    const importTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Import timeout')), 30000)
    );
    // Critical CSS loaded eagerly, rest deferred
    const importApp = Promise.all([
      import("./critical.css"),
      import("./App.tsx"),
    ]);

    // Preload full CSS in background (non-blocking)
    import("./index.css");

    const [, { default: App }] = await Promise.race([importApp, importTimeout]) as [any, { default: any }];

    createRoot(root).render(<App />);

    // Preload Dashboard chunk only when the user is actually heading there.
    // Preloading on every route (e.g. /executive-hub) caused parallel chunk
    // fetches that overwhelmed slow connections and tripped the error UI.
    try {
      const cached = localStorage.getItem('welile_session_cache');
      const path = window.location.pathname;
      const dashboardRoutes = ['/', '/dashboard'];
      if (cached && dashboardRoutes.includes(path)) {
        // Defer until idle so it never competes with the current route's chunks.
        // Routed through the queue (via dynamic import of the helper) to respect
        // the global concurrency limit on slow networks.
        const preload = () => {
          import('./lib/lazyWithRetry')
            .then(({ queuedImport }) => queuedImport(() => import('./pages/Dashboard')))
            .catch(() => {});
        };
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(preload, { timeout: 3000 });
        } else {
          setTimeout(preload, 1500);
        }
      }
    } catch {}
    schedulePreviewBlankPageGuard();
  } catch (err) {
    console.error('[Main] App load failed:', err);
    // Stale-deploy recovery: most app-load failures are stale chunk hashes
    // after a redeploy (Vite rotates ?v=… query strings). Clear caches and
    // hard-reload once before falling back to the error UI.
    const msg = String((err as any)?.message || err || '').toLowerCase();
    const isChunkError =
      msg.includes('dynamically imported') ||
      msg.includes('failed to fetch') ||
      msg.includes('loading chunk') ||
      msg.includes('import timeout') ||
      msg.includes('module script failed');
    const reloadKey = '__welile_chunk_reload_at';
    const lastReload = Number(sessionStorage.getItem(reloadKey) || '0');
    const recentlyReloaded = Date.now() - lastReload < 30_000;
    if (isChunkError && !recentlyReloaded) {
      try {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        if ('caches' in window) {
          await caches.keys().then((keys) =>
            Promise.all(keys.map((k) => caches.delete(k)))
          ).catch(() => {});
        }
      } catch {}
      location.reload();
      return;
    }
    showErrorUI();
  }
};

function showErrorUI() {
  root.textContent = '';
  const container = document.createElement('div');
  container.style.cssText = 'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;gap:16px;padding:24px;text-align:center';

  const logo = document.createElement('img');
  logo.src = '/welile-logo.png';
  logo.alt = 'Welile';
  logo.width = 48;
  logo.height = 48;
  logo.style.borderRadius = '12px';

  const heading = document.createElement('h2');
  heading.textContent = 'Update Available';
  heading.style.cssText = 'font-size:18px;font-weight:600;color:#1f2937;margin:0';

  const msg = document.createElement('p');
  msg.textContent = 'A newer version of Welile is ready. Tap below to load it.';
  msg.style.cssText = 'font-size:14px;color:#6b7280;margin:0;max-width:280px';

  const btn = document.createElement('button');
  btn.textContent = 'Reload App';
  btn.onclick = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {}
    location.reload();
  };
  btn.style.cssText = 'padding:12px 24px;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;min-height:44px';

  container.append(logo, heading, msg, btn);
  root.appendChild(container);
}

loadApp();

// Install centralized client-side error reporting (window.onerror +
// unhandledrejection). Lazy-loaded to avoid pulling supabase into the
// critical startup path.
import('./lib/errorReporting')
  .then((m) => m.installGlobalErrorReporting())
  .catch(() => {});

// Show retry UI after 6s on slow networks
setTimeout(() => {
  if (root.innerHTML.includes('animation:')) {
    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Tap to Retry';
    retryBtn.onclick = () => location.reload();
    retryBtn.style.cssText = 'padding:12px 24px;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;min-height:44px;margin-top:8px';
    root.firstElementChild?.appendChild(retryBtn);
  }
}, 10000);

// Suppress chunk/import errors — user can pull-to-refresh manually
addEventListener('vite:preloadError', (e) => e.preventDefault());
addEventListener('unhandledrejection', (e) => {
  const r = String((e as any).reason ?? '').toLowerCase();
  if (r.includes('dynamically imported') || r.includes('failed to fetch') || r.includes('loading chunk') || r.includes('import timeout') || r.includes('module script failed')) {
    e.preventDefault();
  }
});

// Service worker strategy:
// - Preview: disable + unregister to avoid white screens from stale SW cache
// - Live: register for offline support

if ('serviceWorker' in navigator) {
  if (isPreviewHost) {
    // Silently unregister SWs but NEVER force-reload — prevents blank page loops
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister())))
      .catch(() => {});
  } else {
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(register);
    } else {
      setTimeout(register, 1000);
    }
  }
}