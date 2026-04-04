import { useState, useEffect, useCallback } from 'react';
import { Download, Share, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { hapticTap } from '@/lib/haptics';
import { globalDeferredPrompt, clearGlobalPrompt } from '@/hooks/usePWAInstall';
import welileLogo from '@/assets/welile-logo.png';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Full-screen gate that blocks the app until the user installs it as a PWA.
 * Renders nothing (passes through children) when:
 *  - Already running in standalone/PWA mode
 *  - Running inside an iframe (Lovable preview)
 *  - Running on a preview host
 */
export default function PWAInstallGate({ children }: { children: React.ReactNode }) {
  const [isStandalone, setIsStandalone] = useState(true); // default true to avoid flash
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    globalDeferredPrompt as BeforeInstallPromptEvent | null
  );
  const [installing, setInstalling] = useState(false);
  // Session-only skip — resets on app reload so gate shows again next visit
  const [skipped, setSkipped] = useState(() => {
    return sessionStorage.getItem('welile_pwa_gate_skipped') === 'true';
  });

  useEffect(() => {
    // Skip gate in iframes / preview
    const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
    const isPreview = window.location.hostname.includes('id-preview--')
      || window.location.hostname.includes('lovableproject.com')
      || window.location.hostname === 'localhost';

    if (inIframe || isPreview) {
      setIsStandalone(true); // pass through
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

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    if (globalDeferredPrompt) {
      setInstallPrompt(globalDeferredPrompt as BeforeInstallPromptEvent);
    }

    const installedHandler = () => {
      setIsStandalone(true);
      setInstallPrompt(null);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const [showMenuGuide, setShowMenuGuide] = useState(false);

  const handleInstall = useCallback(async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    const prompt = installPrompt || (globalDeferredPrompt as BeforeInstallPromptEvent | null);
    if (prompt) {
      try {
        setInstalling(true);
        hapticTap();
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === 'accepted') {
          setIsStandalone(true);
          localStorage.setItem('welile_pwa_installed', 'true');
          localStorage.setItem('welile_pwa_installed_at', Date.now().toString());
        }
        setInstallPrompt(null);
        clearGlobalPrompt();
      } catch (err) {
        console.error('[PWA Gate] Install error:', err);
        setInstallPrompt(null);
        clearGlobalPrompt();
      } finally {
        setInstalling(false);
      }
      return;
    }

    // No native prompt — show browser menu guide
    hapticTap();
    setShowMenuGuide(true);
  }, [installPrompt, isIOS]);

  // Pass through when installed or skipped
  if (isStandalone || skipped) {
    return <>{children}</>;
  }




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

        {/* Install Button — always visible */}
        <button
          onClick={handleInstall}
          disabled={installing}
          className={cn(
            "w-full flex items-center justify-center gap-3 h-14 rounded-2xl font-bold text-base transition-all touch-manipulation",
            "bg-primary text-primary-foreground shadow-lg",
            "hover:shadow-xl hover:brightness-110 active:scale-[0.97]",
            installing && "opacity-70 cursor-wait"
          )}
        >
          {isIOS ? (
            <>
              <Share className="h-5 w-5" />
              {installing ? 'Installing…' : 'Install App'}
            </>
          ) : (
            <>
              <Download className="h-5 w-5" />
              {installing ? 'Installing…' : 'Install App'}
            </>
          )}
        </button>

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

        {/* Android/Desktop browser menu guide — when no native prompt */}
        <AnimatePresence>
          {showMenuGuide && !isIOS && (
            <motion.div
              className="mt-6 w-full"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <p className="font-semibold text-foreground text-sm">Install from your browser:</p>
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
          onClick={() => { hapticTap(); sessionStorage.setItem('welile_pwa_gate_skipped', 'true'); setSkipped(true); }}
          className="mt-6 text-xs text-muted-foreground/60 underline underline-offset-2 hover:text-muted-foreground transition-colors"
        >
          Continue in browser
        </button>
      </motion.div>
    </div>
  );
}
