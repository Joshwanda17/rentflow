import { useState, useEffect, useCallback, useRef, type TouchEvent } from 'react';
import { Download, Share, Smartphone, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import welileLogo from '@/assets/welile-logo.png';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

function notifyPromptListeners() {
  promptListeners.forEach(fn => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyPromptListeners();
  });
}

export default function PWAInstallGate({ children }: { children: React.ReactNode }) {
  const [isStandalone, setIsStandalone] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showMenuGuide, setShowMenuGuide] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<'accepted' | 'dismissed' | null>(null);
  const [promptReady, setPromptReady] = useState(!!deferredPrompt);
  const [skipped, setSkipped] = useState(() =>
    sessionStorage.getItem('welile_pwa_gate_skipped') === 'true'
  );
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

    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    setIsIOS(iOS || isIPadOS);
    setIsAndroid(/Android/i.test(ua));

    const onPromptReady = () => setPromptReady(true);
    promptListeners.add(onPromptReady);
    if (deferredPrompt) setPromptReady(true);

    const onInstalled = () => {
      setIsStandalone(true);
      setInstallResult('accepted');
    };

    window.addEventListener('appinstalled', onInstalled);

    return () => {
      promptListeners.delete(onPromptReady);
      window.removeEventListener('appinstalled', onInstalled);
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

    const prompt = deferredPrompt;

    if (!prompt) {
      setShowMenuGuide(true);
      return;
    }

    setInstalling(true);

    prompt
      .prompt()
      .then(() => prompt.userChoice)
      .then(({ outcome }) => {
        if (outcome === 'accepted') {
          setIsStandalone(true);
          setInstallResult('accepted');
          localStorage.setItem('welile_pwa_installed', 'true');
          localStorage.setItem('welile_pwa_installed_at', Date.now().toString());
        } else {
          setInstallResult('dismissed');
          setShowMenuGuide(true);
        }

        deferredPrompt = null;
        setPromptReady(false);
        setInstalling(false);
      })
      .catch(() => {
        deferredPrompt = null;
        setPromptReady(false);
        setShowMenuGuide(true);
        setInstalling(false);
      });
  }, [isIOS]);

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

  if (isStandalone || skipped) {
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
          For the best experience, install Welile on your device. It's fast, works offline, and feels like a native app.
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

        <button
          type="button"
          onClick={() => {
            hapticTap();
            sessionStorage.setItem('welile_pwa_gate_skipped', 'true');
            setSkipped(true);
          }}
          className="mt-6 text-xs text-muted-foreground/60 underline underline-offset-2 hover:text-muted-foreground transition-colors"
        >
          Continue in browser
        </button>
      </motion.div>
    </div>
  );
}
