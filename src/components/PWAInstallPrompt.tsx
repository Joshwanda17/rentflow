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
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showPrompt, setShowPrompt] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isFromLink, setIsFromLink] = useState(false);
  const [platform] = useState(() => detectPlatform());
  const navigate = useNavigate();
  const location = useLocation();

  // Check if user came from a shared link (referrer, UTM params, or specific routes)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hasReferrer = document.referrer && !document.referrer.includes(window.location.hostname);
    const hasUTM = urlParams.has('ref') || urlParams.has('utm_source') || urlParams.has('invite');
    const isShareRoute = window.location.pathname.includes('/invite') || 
                         window.location.pathname.includes('/referral') ||
                         window.location.pathname.includes('/share');
    
    if (hasReferrer || hasUTM || isShareRoute) {
      setIsFromLink(true);
    }
  }, []);

  useEffect(() => {
    // Skip if already installed
    if (isInstalled) return;

    // For users from shared links, show immediately and more aggressively
    if (isFromLink && (isInstallable || platform.canInstallPWA || platform.os === 'ios')) {
      setShowPrompt(true);
      // Show full guide for iOS or manual install platforms
      if (platform.installMethod === 'manual') {
        setShowInstallGuide(true);
      }
      return;
    }

    // For regular users, show after a brief delay
    const timer = setTimeout(() => {
      if ((isInstallable || platform.canInstallPWA || platform.os === 'ios') && !isInstalled) {
        setShowPrompt(true);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled, isFromLink, platform]);

  // Auto-trigger install prompt on Android when user taps anything
  const triggerAutoInstall = useCallback(async () => {
    if (isInstallable && platform.installMethod === 'prompt') {
      const success = await promptInstall();
      if (success) {
        setShowPrompt(false);
      }
    }
  }, [isInstallable, platform.installMethod, promptInstall]);

  // For shared links on Android, auto-trigger install after short delay
  useEffect(() => {
    if (isFromLink && isInstallable && platform.installMethod === 'prompt' && !isInstalled) {
      const timer = setTimeout(() => {
        triggerAutoInstall();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isFromLink, isInstallable, platform.installMethod, isInstalled, triggerAutoInstall]);

  const handleInstall = async () => {
    if (platform.installMethod === 'prompt') {
      const success = await promptInstall();
      if (success) {
        setShowPrompt(false);
        toast.success('App installed! Redirecting to login...');
        setTimeout(() => {
          navigate('/auth', { replace: true });
        }, 1000);
      }
    } else {
      // Show the install guide for manual installation
      setShowInstallGuide(true);
    }
    return false;
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowInstallGuide(false);
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
        onInstall={platform.installMethod === 'prompt' ? async () => {
          const success = await promptInstall();
          if (success) {
            toast.success('App installed!');
            navigate('/auth', { replace: true });
            return true;
          }
          return false;
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
                  className="gap-2 w-full font-semibold shadow-lg touch-manipulation"
                >
                  <Download className="h-5 w-5" />
                  {platform.installMethod === 'prompt' ? 'Install App' : 'See How'}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
