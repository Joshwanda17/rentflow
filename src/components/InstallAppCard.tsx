import { useEffect, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useInstallPreflight } from '@/hooks/useInstallPreflight';
import { toast } from 'sonner';
import { trackInstallEvent } from '@/lib/installTracking';

const IOSInstallGuide = lazy(() => import('@/components/IOSInstallGuide'));

const SESSION_KEY = 'welile_install_card_dismissed';

interface InstallAppCardProps {
  className?: string;
}

export default function InstallAppCard({ className }: InstallAppCardProps) {
  const { canShow, isInstalled, isIOS, hasPrompt, promptInstall } = usePWAInstall();
  // Preflight: don't advertise install until the manifest, apple-touch-icon,
  // service worker script, and a signed/CDN asset download all resolve.
  const preflight = useInstallPreflight(!isInstalled);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(SESSION_KEY) === '1';
  });
  const [isInstalling, setIsInstalling] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Auto-hide after install
  useEffect(() => {
    if (isInstalled) setDismissed(true);
  }, [isInstalled]);

  // Log card impression once per mount when visible.
  useEffect(() => {
    if (isInstalled || dismissed || !canShow) return;
    if (preflight.loading || !preflight.ready) return;
    trackInstallEvent('install_card_shown', { isIOS, hasPrompt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preflight.loading, preflight.ready]);

  // Emit a one-time preflight-failure telemetry per session so we can measure
  // how often users are silently blocked from seeing the card.
  useEffect(() => {
    if (preflight.loading || preflight.ready || preflight.checks.length === 0) return;
    const failed = preflight.checks.filter((c) => !c.ok).map((c) => c.key);
    trackInstallEvent('install_preflight_failed', { failed, isIOS });
  }, [preflight.loading, preflight.ready, preflight.checks, isIOS]);

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setDismissed(true);
    trackInstallEvent('install_card_dismissed', { isIOS });
  };

  const handleInstall = async () => {
    trackInstallEvent('install_cta_clicked', { isIOS, hasPrompt });
    if (isIOS) {
      // Open the full guide (with in-app-browser detection + copy link).
      // A toast alone is not enough — most iPhone install failures are users
      // opening the link from WhatsApp/Facebook/Instagram in-app browsers.
      setShowIOSGuide(true);
      trackInstallEvent('ios_guide_opened', { source: 'install_card' });
      return;
    }
    if (!hasPrompt || isInstalling) return;

    setIsInstalling(true);
    trackInstallEvent('native_prompt_shown');
    try {
      const accepted = await promptInstall();
      if (accepted) {
        trackInstallEvent('native_prompt_accepted');
        trackInstallEvent('app_installed');
        toast.success('App installed successfully!');
        handleDismiss();
      } else {
        trackInstallEvent('native_prompt_dismissed');
      }
      // If dismissed in native prompt, leave the card so user can retry
    } catch {
      // Silent fail — hook already cleans up
    } finally {
      setIsInstalling(false);
    }
  };

  // Hide conditions
  if (isInstalled) return null;
  if (dismissed) return null;
  if (!canShow) return null; // covers: unsupported browser AND not iOS AND no prompt
  // Preflight gate: hide the card until every readiness check passes. If a
  // check fails, /install-diagnostics surfaces the reason.
  if (preflight.loading) return null;
  if (!preflight.ready) return null;

  return (
    <>
    {showIOSGuide && (
      <Suspense fallback={null}>
        <IOSInstallGuide onClose={() => setShowIOSGuide(false)} />
      </Suspense>
    )}
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={className}
      >
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm p-4 sm:p-5">
          {/* Decorative accent */}
          <div
            aria-hidden
            className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/10 blur-2xl pointer-events-none"
          />

          <button
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>

          <div className="flex items-start gap-4 pr-8">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
              <Zap className="h-6 w-6 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground leading-tight">
                Install App
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {isIOS
                  ? 'Add Welile to your home screen for faster access and a native app feel.'
                  : 'Faster access, offline-ready, and a native app feel right from your home screen.'}
              </p>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleInstall}
                  disabled={isInstalling || (!isIOS && !hasPrompt)}
                  size="sm"
                  className="gap-1.5 font-semibold"
                >
                  {isIOS ? <Share className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  {isInstalling ? 'Installing…' : isIOS ? 'How to install' : 'Install App'}
                </Button>
                <Button
                  onClick={handleDismiss}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  Not now
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
    </>
  );
}
