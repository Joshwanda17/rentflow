import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Zap, WifiOff, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { detectPlatform, getBrowserName, getOSName } from '@/lib/platformDetection';
import AdaptiveInstallGuide from './AdaptiveInstallGuide';

const features = [
  { icon: Zap, label: 'Instant access from home screen' },
  { icon: WifiOff, label: 'Works offline & loads faster' },
  { icon: Shield, label: 'Secure & private experience' },
];

export default function PWAInstallPrompt() {
  const { isInstallable, isInstalled, promptInstall, hasPrompt } = usePWAInstall();
  const [showPrompt, setShowPrompt] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [platform] = useState(() => detectPlatform());
  const [isInstalling, setIsInstalling] = useState(false);
  const [autoInstallAttempted, setAutoInstallAttempted] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const hasRecentlyDismissed = useCallback(() => {
    const dismissedAt = localStorage.getItem('welile_install_dismissed_at');
    if (!dismissedAt) return false;
    const dismissedTime = parseInt(dismissedAt, 10);
    return Date.now() - dismissedTime < 2 * 60 * 60 * 1000;
  }, []);

  const isMobile = platform.device === 'mobile' || platform.device === 'tablet';

  useEffect(() => {
    if (isInstalled) return;
    if (hasRecentlyDismissed()) return;

    if (platform.os === 'ios') {
      setShowPrompt(true);
      const timer = setTimeout(() => setShowInstallGuide(true), 300);
      return () => clearTimeout(timer);
    }

    setShowPrompt(true);
  }, [isInstalled, platform, hasRecentlyDismissed]);

  useEffect(() => {
    if (autoInstallAttempted) return;
    if (isInstalled) return;
    if (hasRecentlyDismissed()) return;

    if ((isInstallable || hasPrompt) && platform.installMethod === 'prompt') {
      setAutoInstallAttempted(true);
      const timer = setTimeout(async () => {
        console.log('[PWA] Auto-triggering install prompt...');
        const success = await promptInstall();
        if (success) {
          setShowPrompt(false);
          toast.success('App installed!');
          navigate('/auth', { replace: true });
        } else {
          setShowPrompt(true);
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isInstallable, hasPrompt, platform.installMethod, isInstalled, autoInstallAttempted, promptInstall, navigate, hasRecentlyDismissed]);

  const handleInstall = async () => {
    if (isInstalling) return;

    if (platform.installMethod === 'prompt' && (isInstallable || hasPrompt)) {
      setIsInstalling(true);
      try {
        const success = await promptInstall();
        if (success) {
          setShowPrompt(false);
          toast.success('App installed! Redirecting to login...');
          setTimeout(() => navigate('/auth', { replace: true }), 1000);
        } else {
          if (!hasPrompt) {
            toast.info('Tap the menu button to install manually');
            setShowInstallGuide(true);
          }
        }
      } catch (error) {
        console.error('[PWA] Install error:', error);
        toast.error('Installation failed. Try using the browser menu.');
        setShowInstallGuide(true);
      } finally {
        setIsInstalling(false);
      }
    } else {
      setShowInstallGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowInstallGuide(false);
    localStorage.setItem('welile_install_dismissed_at', Date.now().toString());
  };

  useEffect(() => {
    const justInstalled = localStorage.getItem('welile_pwa_installed');
    const installedAt = localStorage.getItem('welile_pwa_installed_at');

    if (justInstalled === 'true' && installedAt) {
      const installedTime = parseInt(installedAt, 10);
      if (Date.now() - installedTime < 30000 && location.pathname !== '/auth') {
        localStorage.removeItem('welile_pwa_installed_at');
        navigate('/auth', { replace: true });
      }
    }
  }, [navigate, location.pathname]);

  if (isInstalled) return null;

  if (showInstallGuide) {
    return (
      <AdaptiveInstallGuide
        onClose={handleDismiss}
        onInstall={(platform.installMethod === 'prompt' && (isInstallable || hasPrompt)) ? async () => {
          setIsInstalling(true);
          try {
            const success = await promptInstall();
            if (success) {
              toast.success('App installed!');
              navigate('/auth', { replace: true });
              return true;
            }
            return false;
          } finally {
            setIsInstalling(false);
          }
        } : undefined}
      />
    );
  }

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={handleDismiss}
          />

          {/* Card */}
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32, delay: 0.05 }}
            className="relative w-full max-w-sm mx-4 mb-6 sm:mb-0"
          >
            <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
              {/* Header band */}
              <div className="bg-primary px-6 pt-8 pb-6 text-center relative">
                <button
                  onClick={handleDismiss}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors touch-manipulation"
                >
                  <X className="h-4 w-4 text-primary-foreground/80" />
                </button>

                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.15 }}
                  className="mx-auto w-[72px] h-[72px] rounded-[18px] overflow-hidden shadow-lg ring-4 ring-primary-foreground/20 mb-4"
                >
                  <img src="/welile-logo.png" alt="Welile" className="w-full h-full object-cover" />
                </motion.div>

                <h2 className="text-xl font-bold text-primary-foreground">
                  Get the Welile App
                </h2>
                <p className="text-sm text-primary-foreground/70 mt-1">
                  Fast, reliable &amp; always available
                </p>
              </div>

              {/* Features list */}
              <div className="px-6 py-5 space-y-3.5">
                {features.map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.08 }}
                    className="flex items-center gap-3"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <f.icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm text-foreground">{f.label}</span>
                  </motion.div>
                ))}
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 space-y-2.5">
                <Button
                  onClick={handleInstall}
                  size="lg"
                  disabled={isInstalling}
                  className="w-full gap-2 font-semibold h-12 text-base shadow-md touch-manipulation active:scale-[0.98] transition-transform"
                  style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
                >
                  <Download className="h-5 w-5" />
                  {isInstalling
                    ? 'Installing…'
                    : platform.installMethod === 'prompt'
                      ? 'Install Now'
                      : 'How to Install'}
                </Button>

                <button
                  onClick={handleDismiss}
                  className="w-full text-center text-xs text-muted-foreground py-2 hover:text-foreground transition-colors touch-manipulation"
                >
                  Not now
                </button>
              </div>

              {/* Footer info */}
              <div className="border-t border-border px-6 py-3 flex items-center justify-center gap-1.5">
                <Smartphone className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">
                  {getBrowserName(platform.browser)} · {getOSName(platform.os)}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
