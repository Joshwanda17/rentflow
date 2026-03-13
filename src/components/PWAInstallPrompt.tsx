import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { detectPlatform, getBrowserName, getOSName } from '@/lib/platformDetection';
import AdaptiveInstallGuide from './AdaptiveInstallGuide';

export default function PWAInstallPrompt() {
  const { isInstallable, isInstalled, promptInstall, hasPrompt } = usePWAInstall();
  const [showPrompt, setShowPrompt] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [platform] = useState(() => detectPlatform());
  const [isInstalling, setIsInstalling] = useState(false);
  const [autoInstallAttempted, setAutoInstallAttempted] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Check if user has dismissed install recently (don't spam them)
  const hasRecentlyDismissed = useCallback(() => {
    const dismissedAt = localStorage.getItem('welile_install_dismissed_at');
    if (!dismissedAt) return false;
    const dismissedTime = parseInt(dismissedAt, 10);
    // Only show again after 2 hours
    return Date.now() - dismissedTime < 2 * 60 * 60 * 1000;
  }, []);

  // Detect if this is a mobile device
  const isMobile = platform.device === 'mobile' || platform.device === 'tablet';

  // Auto-trigger install on all devices (mobile + desktop)
  useEffect(() => {
    // Skip if already installed
    if (isInstalled) return;
    
    // Skip if user recently dismissed
    if (hasRecentlyDismissed()) return;

    // For iOS, show install guide immediately
    if (platform.os === 'ios') {
      setShowPrompt(true);
      const timer = setTimeout(() => {
        setShowInstallGuide(true);
      }, 300);
      return () => clearTimeout(timer);
    }

    // For all devices with prompt support, show prompt immediately
    setShowPrompt(true);
  }, [isInstalled, platform, hasRecentlyDismissed]);

  // Auto-trigger the native install prompt on Android as soon as it's available
  useEffect(() => {
    if (autoInstallAttempted) return;
    if (isInstalled) return;
    if (hasRecentlyDismissed()) return;
    
    // When the install prompt becomes available, trigger it automatically
    if ((isInstallable || hasPrompt) && platform.installMethod === 'prompt') {
      setAutoInstallAttempted(true);
      
      // Trigger quickly
      const timer = setTimeout(async () => {
        console.log('[PWA] Auto-triggering install prompt for mobile...');
        const success = await promptInstall();
        if (success) {
          setShowPrompt(false);
          toast.success('App installed!');
          navigate('/auth', { replace: true });
        } else {
          // If user dismissed, still show the banner
          setShowPrompt(true);
        }
      }, 800);
      
      return () => clearTimeout(timer);
    }
  }, [isInstallable, hasPrompt, platform.installMethod, isMobile, isInstalled, autoInstallAttempted, promptInstall, navigate, hasRecentlyDismissed]);

  const handleInstall = async () => {
    // Prevent double-clicks
    if (isInstalling) return;
    
    if (platform.installMethod === 'prompt' && (isInstallable || hasPrompt)) {
      setIsInstalling(true);
      try {
        const success = await promptInstall();
        if (success) {
          setShowPrompt(false);
          toast.success('App installed! Redirecting to login...');
          setTimeout(() => {
            navigate('/auth', { replace: true });
          }, 1000);
        } else {
          // If prompt failed but we're on a supported platform, show manual guide
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
      // Show the install guide for manual installation
      setShowInstallGuide(true);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowInstallGuide(false);
    // Track dismissal to avoid spamming the user
    localStorage.setItem('welile_install_dismissed_at', Date.now().toString());
  };

  // Check if just installed and redirect to auth
  useEffect(() => {
    const justInstalled = localStorage.getItem('welile_pwa_installed');
    const installedAt = localStorage.getItem('welile_pwa_installed_at');
    
    if (justInstalled === 'true' && installedAt) {
      const installedTime = parseInt(installedAt, 10);
      const now = Date.now();
      if (now - installedTime < 30000 && location.pathname !== '/auth') {
        localStorage.removeItem('welile_pwa_installed_at');
        navigate('/auth', { replace: true });
      }
    }
  }, [navigate, location.pathname]);

  if (isInstalled) return null;

  // Show the adaptive install guide
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
          initial={{ y: 100, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 100, opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
          style={{
            bottom: 'max(env(safe-area-inset-bottom) + 16px, 16px)',
          }}
        >
          <div className="bg-card border-2 border-primary/30 rounded-3xl shadow-2xl p-5 relative overflow-hidden">
            {/* Animated gradient background */}
            <motion.div 
              className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/10 to-blue-500/10 pointer-events-none"
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
            
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted transition-colors z-10 touch-manipulation"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>

            <div className="relative flex items-start gap-4">
              {/* App icon with pulse */}
              <motion.div 
                className="flex-shrink-0 w-16 h-16 rounded-2xl overflow-hidden shadow-xl ring-2 ring-primary/20"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <img src="/welile-logo.png" alt="Welile" className="w-full h-full object-cover" />
              </motion.div>

              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg text-foreground mb-1">Install Welile</h3>
                <p className="text-xs text-muted-foreground mb-1">
                  {getBrowserName(platform.browser)} on {getOSName(platform.os)}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {platform.installMethod === 'prompt' 
                    ? 'Install now for quick access & offline use'
                    : 'Add to home screen for the best experience'
                  }
                </p>

                <Button 
                  onClick={() => handleInstall()}
                  size="lg"
                  disabled={isInstalling}
                  className="gap-2 w-full font-semibold shadow-lg touch-manipulation active:scale-[0.98] transition-transform text-base h-12"
                  style={{ WebkitTapHighlightColor: 'transparent', fontSize: '16px' }}
                >
                  <Download className="h-5 w-5" />
                  {isInstalling ? 'Installing...' : (platform.installMethod === 'prompt' ? 'Install App' : 'See How')}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
