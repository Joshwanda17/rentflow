// MUST be first: runtime polyfills for old mobile browsers (String.replaceAll,
// Array.at, Object.hasOwn, Promise.allSettled, …). Vite target es2017 only
// down-levels syntax, not runtime methods — without this, older Android/iOS
// phones crash to a blank screen when deps like input-otp call replaceAll.
import './lib/runtimePolyfills';
// Then: drops the stored session on a cold start when the user opted
// out of "remember this device", before Supabase/session-cache read any token.
import './lib/ephemeralGuard';
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
  const userForced = localStorage.getItem('welile-no-blur') === '1';
  if (userForced || isAndroid) {
    document.documentElement.classList.add('no-backdrop-blur');
    document.documentElement.classList.add('android-compositor-safe');
  }

  // Low-end / Android Go-class detection. Any of these signals => "lite-mode":
  // little RAM, few cores, explicit reduced-motion, or Data Saver. Lite-mode
  // shares the android-compositor-safe rules (no blur, no big shadows, static
  // motion) so entry-level devices (e.g. itel A08) render without GPU tearing.
  const deviceMemory = (navigator as any).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const conn = (navigator as any).connection;
  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const saveData = conn?.saveData === true;
  const isLowEnd =
    (typeof deviceMemory === 'number' && deviceMemory <= 3) ||
    (typeof cores === 'number' && cores <= 4);
  if (isLowEnd || prefersReducedMotion || saveData) {
    document.documentElement.classList.add('lite-mode');
    // Lite devices also get the compositor-safe path even on non-Android.
    document.documentElement.classList.add('android-compositor-safe');
    document.documentElement.classList.add('no-backdrop-blur');
  }
} catch {}

// Unregister any service workers and clear leftover caches. The app no longer
// ships a service worker; this only cleans up workers from older installs so
// devices stop serving a stale shell. The Lovable proxy already serves HTML
// with no-cache, so the browser revalidates on every navigation.
//
// IMPORTANT: this runs ONCE per cleanup version, gated by a localStorage flag.
// Previously it deleted every Cache Storage entry on every launch, which forced
// slow cold re-fetches on low-end phones. Bump CACHE_CLEANUP_VERSION only when a
// new legacy artifact must be purged.
const CACHE_CLEANUP_VERSION = '2026-07-06';
const cleanupServiceWorkersAndCaches = () => {
  try {
    if (localStorage.getItem('welile-cache-cleanup') === CACHE_CLEANUP_VERSION) {
      return; // already cleaned for this version — skip the expensive work
    }
  } catch {}
  try {
    navigator.serviceWorker?.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    }).catch(() => {});
  } catch {}
  try {
    if ('caches' in window) {
      caches.keys().then((keys) =>
        Promise.all(keys.map((k) => caches.delete(k)))
      ).catch(() => {});
    }
  } catch {}
  try {
    localStorage.setItem('welile-cache-cleanup', CACHE_CLEANUP_VERSION);
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

// Mount the app.
const loadApp = async () => {
  cleanupServiceWorkersAndCaches();
  try {
    const importTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Import timeout')), 30000)
    );
    const importApp = Promise.all([
      import('./critical.css'),
      import('./App.tsx'),
    ]);
    // Preload full CSS in background (non-blocking)
    import('./index.css');

    const [, { default: App }] = (await Promise.race([importApp, importTimeout])) as [
      unknown,
      { default: () => JSX.Element },
    ];

    createRoot(root).render(<App />);

    // Signal the inline out-of-date-browser watchdog (index.html) that React
    // successfully mounted, so it never shows the banner on healthy sessions.
    try { (window as any).__WELILE_APP_READY__ = true; } catch {}

    // Preload Dashboard chunk only when the user is actually heading there.
    try {
      const cached = localStorage.getItem('welile_session_cache');
      const path = window.location.pathname;
      const dashboardRoutes = ['/', '/dashboard'];
      if (cached && dashboardRoutes.includes(path)) {
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
    showErrorUI();
  }
};

function showErrorUI() {
  root.textContent = '';
  const container = document.createElement('div');
  container.style.cssText =
    'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f8fafc;gap:16px;padding:24px;text-align:center';

  const logo = document.createElement('img');
  logo.src = '/welile-logo.png';
  logo.alt = 'Welile';
  logo.width = 48;
  logo.height = 48;
  logo.style.borderRadius = '12px';

  const heading = document.createElement('h2');
  heading.textContent = 'Something went wrong';
  heading.style.cssText = 'font-size:18px;font-weight:600;color:#1f2937;margin:0';

  const msg = document.createElement('p');
  msg.textContent = 'We could not load the app. Tap below to reload.';
  msg.style.cssText = 'font-size:14px;color:#6b7280;margin:0;max-width:280px';

  const btn = document.createElement('button');
  btn.textContent = 'Reload App';
  btn.onclick = () => window.location.reload();
  btn.style.cssText =
    'padding:12px 24px;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;min-height:44px';

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

// Show retry UI after 10s on slow networks
setTimeout(() => {
  if (root.innerHTML.includes('animation:')) {
    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Tap to Retry';
    retryBtn.onclick = () => window.location.reload();
    retryBtn.style.cssText =
      'padding:12px 24px;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;min-height:44px;margin-top:8px';
    root.firstElementChild?.appendChild(retryBtn);
  }
}, 10000);

// Suppress chunk/import preload errors — the browser revalidates HTML on the
// next navigation, so a plain reload recovers from a redeployed bundle.
addEventListener('vite:preloadError', (e) => e.preventDefault());
addEventListener('unhandledrejection', (e) => {
  const r = String((e as any).reason ?? '').toLowerCase();
  if (
    r.includes('dynamically imported') ||
    r.includes('failed to fetch') ||
    r.includes('loading chunk') ||
    r.includes('import timeout') ||
    r.includes('module script failed')
  ) {
    e.preventDefault();
  }
});
