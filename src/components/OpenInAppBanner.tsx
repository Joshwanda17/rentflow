import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowUpRight, Download, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { toast } from 'sonner';

const SESSION_KEY = 'welile_open_in_app_dismissed';

/** True when the page is running as the installed standalone app (any platform). */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** True in the Lovable editor/preview iframe — never prompt there. */
function isPreviewContext(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.self !== window.top) return true; // inside an iframe
  } catch {
    return true; // cross-origin frame access throws → treat as iframe
  }
  const host = window.location.hostname;
  return (
    host.startsWith('id-preview--') ||
    host.startsWith('preview--') ||
    host.endsWith('.lovableproject.com') ||
    host.endsWith('.lovable.app') === false && host.endsWith('lovableproject.com')
  );
}

interface OpenInAppBannerProps {
  className?: string;
}

/**
 * Shows a slim banner when the site is opened in a regular browser tab (not the
 * installed app). Lets the user jump into the installed PWA — where their
 * session already lives — or install it if they haven't yet.
 *
 * NOTE: Browsers cannot share a login session across browser sandboxes, and
 * there is no universal API to programmatically launch an installed PWA. This
 * uses best-effort signals: `getInstalledRelatedApps()` on Android Chrome to
 * detect the installed app, link-capture navigation to hand off into it, and
 * the standard install prompt / iOS instructions as the fallback.
 */
export default function OpenInAppBanner({ className }: OpenInAppBannerProps) {
  const { isIOS, hasPrompt, promptInstall } = usePWAInstall();
  const [show, setShow] = useState(false);
  const [installedDetected, setInstalledDetected] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone()) return; // already in the app
    if (isPreviewContext()) return; // Lovable preview / iframe
    if (sessionStorage.getItem(SESSION_KEY) === '1') return; // dismissed

    let cancelled = false;

    const decide = async () => {
      // Android Chrome can confirm the PWA is installed via related apps.
      const nav = navigator as Navigator & {
        getInstalledRelatedApps?: () => Promise<Array<{ platform?: string }>>;
      };
      let detected = false;
      if (typeof nav.getInstalledRelatedApps === 'function') {
        try {
          const apps = await nav.getInstalledRelatedApps();
          detected = Array.isArray(apps) && apps.length > 0;
        } catch {
          /* ignore — API not granted/available */
        }
      }
      // Fallback signal: this browser previously installed the app.
      if (!detected && localStorage.getItem('welile_pwa_installed') === 'true') {
        detected = true;
      }
      if (cancelled) return;
      setInstalledDetected(detected);
      // Show the banner shortly after load so it doesn't fight first paint.
      setTimeout(() => !cancelled && setShow(true), 1200);
    };

    decide();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setShow(false);
  };

  const handleOpen = async () => {
    // iOS: PWAs cannot be launched from another browser — guide the user.
    if (isIOS) {
      if (installedDetected) {
        toast('Open the Welile app from your home screen to continue signed in.', {
          duration: 6000,
        });
      } else {
        toast('Tap the Share button, then "Add to Home Screen" to install the app.', {
          duration: 6000,
        });
      }
      dismiss();
      return;
    }

    // Android / desktop: if not installed, offer the native install prompt.
    if (!installedDetected && hasPrompt) {
      const accepted = await promptInstall();
      if (accepted) {
        toast.success('App installed! Open it from your home screen to stay signed in.');
      }
      dismiss();
      return;
    }

    // Installed → attempt link-capture hand-off into the installed app.
    // Chrome on Android opens the scope URL in the installed PWA when link
    // capturing is enabled; otherwise this is a harmless same-tab navigation.
    try {
      window.location.href = `${window.location.origin}/dashboard`;
    } catch {
      /* ignore */
    }
    dismiss();
  };

  if (!show) return null;

  const ctaLabel = installedDetected
    ? 'Open app'
    : isIOS
      ? 'How to install'
      : 'Install app';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className={
            className ??
            'fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md'
          }
        >
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur shadow-lg p-3 pr-2">
            <img
              src="/welile-logo.png"
              alt="Welile"
              className="w-9 h-9 rounded-xl flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {installedDetected ? 'Open in the Welile app' : 'Get the Welile app'}
              </p>
              <p className="text-xs text-muted-foreground leading-snug">
                {installedDetected
                  ? "You're already signed in there."
                  : 'Faster access and stay signed in.'}
              </p>
            </div>
            <Button
              onClick={handleOpen}
              size="sm"
              className="gap-1.5 font-semibold flex-shrink-0"
            >
              {installedDetected ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : isIOS ? (
                <Share className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {ctaLabel}
            </Button>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center flex-shrink-0"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}