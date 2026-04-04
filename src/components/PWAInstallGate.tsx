import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Share, Smartphone, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import welileLogo from '@/assets/welile-logo.png';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// ─── Global prompt capture (runs once at module load) ───
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

function notifyPromptListeners() {
  promptListeners.forEach(fn => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    console.log('[PWA] beforeinstallprompt captured globally');
    notifyPromptListeners();
  });
}

/**
 * Full-screen gate that blocks the app until the user installs it as a PWA.
 * Passes through children when already standalone, in iframe, or on preview host.
 */
export default function PWAInstallGate({ children }: { children: React.ReactNode }) {
  const [isStandalone, setIsStandalone] = useState(true); // true to avoid flash
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showMenuGuide, setShowMenuGuide] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<'accepted' | 'dismissed' | null>(null);
  const [promptReady, setPromptReady] = useState(!!deferredPrompt);
  const [skipped, setSkipped] = useState(() =>
    sessionStorage.getItem('welile_pwa_gate_skipped') === 'true'
  );
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Skip in iframes / preview
    const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
    const isPreview = window.location.hostname.includes('id-preview--')
      || window.location.hostname.includes('lovableproject.com')
      || window.location.hostname === 'localhost';

    if (inIframe || isPreview) {
      setIsStandalone(true);
      return;
    }

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // iOS detection
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    setIsIOS(iOS || isIPadOS);

    // Listen for prompt availability
    const onPromptReady = () => setPromptReady(true);
    promptListeners.add(onPromptReady);
    if (deferredPrompt) setPromptReady(true);

    // Listen for app installed
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

    // iOS — show manual guide immediately
    if (isIOS) {
      setShowIOSGuide(true);
      setShowMenuGuide(false);
      return;
    }

    setInstallResult(null);
    setShowMenuGuide(false);

    const prompt = deferredPrompt;

    if (prompt) {
      // Fire the native install dialog instantly — no awaits before this
      setInstalling(true);
      prompt.prompt().then(() => prompt.userChoice).then(({ outcome }) => {
        console.log('[PWA Gate] User choice:', outcome);
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
      }).catch((err) => {
        console.error('[PWA Gate] prompt() error:', err);
        deferredPrompt = null;
        setPromptReady(false);
        setShowMenuGuide(true);
        setInstalling(false);
      });
    } else {
      // No native prompt — show manual browser install guide instantly
      console.log('[PWA Gate] No deferred prompt — showing manual guide');
      setShowMenuGuide(true);
    }
  }, [isIOS]);

  // Pass through when installed or skipped
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
        {/* Logo */}
        <img src={welileLogo} alt="Welile" className="h-16 w-auto mb-4" />

        {/* Icon */}
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
          <Smartphone className="h-10 w-10 text-primary" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-foreground text-center mb-2">
          Install Welile App
        </h1>
        <p className="text-muted-foreground text-center text-sm mb-8 leading-relaxed">
          For the best experience, install Welile on your device. It's fast, works offline, and feels like a native app.
        </p>

        {/* Install Button */}
        <button
          ref={buttonRef}
          onClick={handleInstall}
          disabled={installing}
          className={cn(
            "w-full flex items-center justify-center gap-3 h-14 rounded-2xl font-bold text-base transition-all touch-manipulation select-none",
            "bg-primary text-primary-foreground shadow-lg",
            "hover:shadow-xl hover:brightness-110 active:scale-[0.97]",
            installing && "opacity-70 cursor-wait"
          )}
          style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        >
          {isIOS ? (
            <Share className="h-5 w-5" />
          ) : (
            <Download className="h-5 w-5" />
          )}
          {buttonLabel}
        </button>

        {/* Status feedback */}
        <AnimatePresence>
          {installResult === 'dismissed' && !showMenuGuide && (
            <motion.p
              className="mt-3 text-xs text-muted-foreground text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              You dismissed the install prompt. Tap "Try Again" or use the browser menu.
            </motion.p>
          )}
        </AnimatePresence>

        {/* iOS Guide */}
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
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                    <span>Tap the <Share className="inline h-4 w-4 -mt-0.5" /> Share button in Safari</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                    <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    <span>Tap <strong>"Add"</strong> to install</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Android/Desktop manual guide */}
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
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                    <span>Tap the <strong>⋮</strong> menu (top-right corner)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                    <span>Tap <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    <span>Tap <strong>"Install"</strong> to confirm</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Skip link */}
        <button
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
