import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Plus, Square, ArrowDown, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export default function PWAInstallPrompt() {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isFromLink, setIsFromLink] = useState(false);

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
    if (isFromLink && (isInstallable || isIOS)) {
      setShowPrompt(true);
      if (isIOS) {
        setShowIOSGuide(true);
      }
      return;
    }

    // For regular users, show after a brief delay
    const timer = setTimeout(() => {
      if ((isInstallable || isIOS) && !isInstalled) {
        setShowPrompt(true);
        if (isIOS) {
          setShowIOSGuide(true);
        }
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled, isIOS, isFromLink]);

  // Auto-trigger install prompt on Android when user taps anything
  const triggerAutoInstall = useCallback(async () => {
    if (isInstallable && !isIOS) {
      const success = await promptInstall();
      if (success) {
        setShowPrompt(false);
      }
    }
  }, [isInstallable, isIOS, promptInstall]);

  // For shared links on Android, auto-trigger install after short delay
  useEffect(() => {
    if (isFromLink && isInstallable && !isIOS && !isInstalled) {
      const timer = setTimeout(() => {
        triggerAutoInstall();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isFromLink, isInstallable, isIOS, isInstalled, triggerAutoInstall]);

  const handleInstall = async () => {
    const success = await promptInstall();
    if (success) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setShowIOSGuide(false);
  };

  if (isInstalled) return null;

  // Full-screen iOS installation guide - more prominent
  if (showIOSGuide && isIOS) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-primary/5">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Install Welile.com</h2>
          </div>
          <button
            onClick={handleDismiss}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-8">
          <div className="max-w-sm mx-auto space-y-8">
            {/* App preview with pulse animation */}
            <div className="text-center">
              <motion.div 
                className="w-24 h-24 mx-auto rounded-3xl overflow-hidden shadow-2xl mb-4 ring-4 ring-primary/20"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <img src="/welile-logo.png" alt="Welile" className="w-full h-full object-cover" />
              </motion.div>
              <h3 className="text-2xl font-bold">Get the App!</h3>
              <p className="text-muted-foreground mt-1">Install for the best experience</p>
            </div>

            {/* Steps */}
            <div className="space-y-4">
              <h4 className="font-semibold text-center text-lg">3 Quick Steps:</h4>
              
              {/* Step 1 */}
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="flex items-start gap-4 p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-2xl border-2 border-primary/30"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg shadow-lg">
                  1
                </div>
                <div className="flex-1">
                  <p className="font-semibold mb-2 text-lg">Tap Share</p>
                  <div className="flex items-center gap-2">
                    <div className="p-3 bg-blue-500 rounded-xl flex flex-col items-center shadow-md">
                      <Square className="h-5 w-5 text-white" strokeWidth={1.5} />
                      <ArrowDown className="h-3 w-3 text-white -mt-1" />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      At the bottom of Safari
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Step 2 */}
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-start gap-4 p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-2xl border-2 border-primary/30"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg shadow-lg">
                  2
                </div>
                <div className="flex-1">
                  <p className="font-semibold mb-2 text-lg">Add to Home Screen</p>
                  <div className="flex items-center gap-2">
                    <div className="p-3 bg-primary rounded-xl shadow-md">
                      <Plus className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-sm text-muted-foreground">Scroll down to find it</span>
                  </div>
                </div>
              </motion.div>

              {/* Step 3 */}
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-start gap-4 p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-2xl border-2 border-primary/30"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg shadow-lg">
                  3
                </div>
                <div className="flex-1">
                  <p className="font-semibold mb-2 text-lg">Tap "Add"</p>
                  <span className="text-sm text-muted-foreground">Done! Open Welile from your home screen</span>
                </div>
              </motion.div>
            </div>

            {/* Benefits with icons */}
            <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl p-5 border border-green-500/20">
              <h5 className="font-semibold mb-3 text-green-700 dark:text-green-400">Why Install?</h5>
              <ul className="text-sm space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">✓</span>
                  <span>Instant access from home screen</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">✓</span>
                  <span>Works offline - no internet needed</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">✓</span>
                  <span>Faster than browser</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-xs">✓</span>
                  <span>Get important notifications</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Sticky footer with arrow pointing down */}
        <div className="p-4 border-t bg-gradient-to-r from-primary/10 to-purple-500/10">
          <div className="max-w-sm mx-auto text-center space-y-3">
            <motion.div 
              className="flex items-center justify-center gap-2 text-primary font-medium"
              animate={{ y: [0, 5, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <ArrowDown className="h-5 w-5" />
              <span>Look for the Share button below</span>
              <ArrowDown className="h-5 w-5" />
            </motion.div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleDismiss}
              className="text-xs text-muted-foreground"
            >
              Maybe later
            </Button>
          </div>
        </div>
      </motion.div>
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
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted transition-colors z-10"
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
                <p className="text-sm text-muted-foreground mb-4">
                  {isIOS 
                    ? 'Add to home screen for the best experience'
                    : 'Install now for quick access & offline use'
                  }
                </p>

                {isIOS ? (
                  <Button 
                    onClick={() => setShowIOSGuide(true)}
                    size="lg"
                    className="gap-2 w-full font-semibold shadow-lg"
                  >
                    <Download className="h-5 w-5" />
                    Install Now
                  </Button>
                ) : (
                  <Button 
                    onClick={handleInstall}
                    size="lg"
                    className="gap-2 w-full font-semibold shadow-lg"
                  >
                    <Download className="h-5 w-5" />
                    Install App
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
