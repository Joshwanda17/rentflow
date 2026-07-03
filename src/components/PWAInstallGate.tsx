import { useState, useEffect, useCallback, useRef, type TouchEvent } from 'react';
import { Download, Share, Smartphone, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { usePWAInstall, globalDeferredPrompt } from '@/hooks/usePWAInstall';
import welileLogo from '@/assets/welile-logo.png';

export default function PWAInstallGate({ children }: { children: React.ReactNode }) {
  // Single source of truth for the captured install prompt + install action.
  const { hasPrompt: promptReady, isInstalled, promptInstall } = usePWAInstall();
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showMenuGuide, setShowMenuGuide] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<'accepted' | 'dismissed' | null>(null);
  const [verifyState, setVerifyState] = useState<'idle' | 'checking' | 'not_standalone'>('idle');
  const tapLockRef = useRef(0);

  useEffect(() => {
    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    const isPreview = window.location.hostname.includes('id-preview--')
      || window.location.hostname.includes('lovableproject.com')
      || window.location.hostname === 'localhost';

    if (inIframe || isPreview) {
      setIsStandalone(true);
      return;
    }

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
      || localStorage.getItem('welile_pwa_installed') === 'true';
    setIsStandalone(standalone);

    // HARD LOCK: there is no "continue in browser" escape hatch anymore. Every
    // user on every device must install Welile before reaching the dashboard.
    // Clean up any old skip flags from previous builds so nobody stays skipped.
    try { sessionStorage.removeItem('welile_install_skipped'); } catch { /* noop */ }
    try { localStorage.removeItem('welile_install_skipped'); } catch { /* noop */ }

    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    setIsIOS(iOS || isIPadOS);
    setIsAndroid(/Android/i.test(ua));
  }, []);

  // Reflect installs detected by the shared hook (e.g. appinstalled event).
  useEffect(() => {
    if (isInstalled) {
      setIsStandalone(true);
      setInstallResult('accepted');
    }
  }, [isInstalled]);

  // Instant detection: the moment the app becomes standalone (installed and
  // launched, or display-mode flips), drop the gate without waiting for a
  // reload. Covers browsers where `appinstalled` is unreliable or delayed.
  useEffect(() => {
    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
    const isPreview = window.location.hostname.includes('id-preview--')
      || window.location.hostname.includes('lovableproject.com')
      || window.location.hostname === 'localhost';
    if (inIframe || isPreview) return;

    const detectStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
      || localStorage.getItem('welile_pwa_installed') === 'true';

    const recheck = () => {
      if (detectStandalone()) {
        setIsStandalone(true);
        setInstallResult('accepted');
      }
    };

    const mq = window.matchMedia('(display-mode: standalone)');
    const onMediaChange = () => recheck();
    // addEventListener is the modern API; addListener is the Safari fallback.
    if (mq.addEventListener) mq.addEventListener('change', onMediaChange);
    else mq.addListener?.(onMediaChange);

    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);

    // Fast poll for a short window right after an install attempt so the gate
    // disappears within a fraction of a second even without an event.
    const interval = window.setInterval(recheck, 800);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onMediaChange);
      else mq.removeListener?.(onMediaChange);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
      window.clearInterval(interval);
    };
  }, []);

  const handleInstall = useCallback(() => {
    hapticTap();

    if (isIOS) {
      setShowIOSGuide(true);
      setShowMenuGuide(false);
      return;
    }

    setInstallResult(null);
    setShowIOSGuide(false);
    setShowMenuGuide(false);

    if (!globalDeferredPrompt) {
      setShowMenuGuide(true);
      return;
    }

    setInstalling(true);

    promptInstall()
      .then((accepted) => {
        if (accepted) {
          setIsStandalone(true);
          setInstallResult('accepted');
          localStorage.setItem('welile_pwa_installed', 'true');
          localStorage.setItem('welile_pwa_installed_at', Date.now().toString());
        } else {
          setInstallResult('dismissed');
          setShowMenuGuide(true);
        }
        setInstalling(false);
      })
      .catch(() => {
        setShowMenuGuide(true);
        setInstalling(false);
      });
  }, [isIOS, promptInstall]);

  const handleButtonClick = useCallback(() => {
    const now = Date.now();
    if (now - tapLockRef.current < 500) return;
    tapLockRef.current = now;
    handleInstall();
  }, [handleInstall]);

  const handleButtonTouchEnd = useCallback((event: TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const now = Date.now();
    if (now - tapLockRef.current < 500) return;
    tapLockRef.current = now;
    handleInstall();
  }, [handleInstall]);

  // Manual verification: re-check the real standalone state on demand for
  // browsers where auto-detection missed. If the browser still reports a
  // non-standalone context, surface a confirm override that trusts the user.
  const handleVerifyInstalled = useCallback(() => {
    hapticTap();
    setVerifyState('checking');
    const detected =
      window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
      || localStorage.getItem('welile_pwa_installed') === 'true';

    window.setTimeout(() => {
      if (detected) {
        setIsStandalone(true);
        setInstallResult('accepted');
        setVerifyState('idle');
      } else {
        setVerifyState('not_standalone');
      }
    }, 450);
  }, []);

  const handleConfirmOverride = useCallback(() => {
    hapticTap();
    try {
      localStorage.setItem('welile_pwa_installed', 'true');
      localStorage.setItem('welile_pwa_installed_at', Date.now().toString());
    } catch {
      /* ignore storage errors */
    }
    setIsStandalone(true);
    setInstallResult('accepted');
  }, []);

  // Force installation on EVERY device (desktop + mobile). The gate is shown
  // until the app is actually installed — there is no way to bypass it.
  if (isStandalone) {
    return <>{children}</>;
  }

  const buttonLabel = installing
    ? 'Installing…'
    : installResult === 'dismissed'
      ? 'Try Again'
      : 'Install App';

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center px-6">
      <motion.div
        className="flex flex-col items-center max-w-sm w-full"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <img src={welileLogo} alt="Welile" className="h-16 w-auto mb-4" />

        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
          <Smartphone className="h-10 w-10 text-primary" />
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center mb-2">
          Install Welile App
        </h1>
        <p className="text-muted-foreground text-center text-sm mb-8 leading-relaxed">
          Welile now runs as an installed app. Please install it on this device to continue — it's fast, secure, works offline, and feels like a native app.
        </p>

        <button
          type="button"
          onClick={handleButtonClick}
          onTouchEnd={handleButtonTouchEnd}
          disabled={installing}
          className={cn(
            'w-full flex items-center justify-center gap-3 h-14 rounded-2xl font-bold text-base transition-all touch-manipulation select-none',
            'bg-primary text-primary-foreground shadow-lg',
            'hover:shadow-xl hover:brightness-110 active:scale-[0.97]',
            installing && 'opacity-70 cursor-wait'
          )}
          style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        >
          {isIOS ? <Share className="h-5 w-5" /> : <Download className="h-5 w-5" />}
          {buttonLabel}
        </button>

        {!promptReady && !isIOS && !showMenuGuide && (
          <p className="mt-3 text-xs text-muted-foreground text-center">
            If your phone does not open the install popup, tap again to see manual install steps.
          </p>
        )}

        <AnimatePresence>
          {installResult === 'dismissed' && !showMenuGuide && (
            <motion.p
              className="mt-3 text-xs text-muted-foreground text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              You dismissed the install prompt. Tap “Try Again” or use the browser menu.
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showIOSGuide && (
            <motion.div
              className="mt-6 w-full"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <p className="font-semibold text-foreground text-sm">Install on iPhone/iPad:</p>
                <p className="text-xs text-muted-foreground">
                  If you opened Welile inside Facebook, Instagram, TikTok, WhatsApp, or another app, first use that app’s menu and choose <strong>Open in Safari</strong>.
                </p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                    <span>Tap the <Share className="inline h-4 w-4 -mt-0.5" /> Share button in Safari</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                    <span>Scroll down and tap <strong>Add to Home Screen</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    <span>Tap <strong>Add</strong> to install</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showMenuGuide && !isIOS && (
            <motion.div
              className="mt-6 w-full"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <p className="font-semibold text-foreground text-sm">Install from your browser:</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  If this phone is inside Facebook, Instagram, TikTok, WhatsApp, or another app, first tap that app’s menu and choose <strong>Open in browser</strong>{isAndroid ? ', then continue in Chrome' : ''}.
                </p>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                    <span>{isAndroid ? 'Open this page in Chrome' : 'Open this page in your browser'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                    <span>Tap the <strong>⋮</strong> menu or browser share menu</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    <span>Tap <strong>Install app</strong> or <strong>Add to Home Screen</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                    <span>Tap <strong>Install</strong> to confirm</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
