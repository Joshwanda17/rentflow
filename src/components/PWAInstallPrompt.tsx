import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export default function PWAInstallPrompt() {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user has previously dismissed
    const wasDismissed = sessionStorage.getItem('pwa-install-dismissed');
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    // Show prompt after a short delay if installable or iOS
    const timer = setTimeout(() => {
      if ((isInstallable || isIOS) && !isInstalled && !dismissed) {
        setShowPrompt(true);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled, isIOS, dismissed]);

  const handleInstall = async () => {
    const success = await promptInstall();
    if (success) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (isInstalled || dismissed) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
        >
          <div className="bg-card border border-primary/20 rounded-2xl shadow-xl p-4 relative overflow-hidden">
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-purple-500/5 pointer-events-none" />
            
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>

            <div className="relative flex items-start gap-4">
              {/* App icon */}
              <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden shadow-lg">
                <img src="/welile-logo.png" alt="Welile" className="w-full h-full object-cover" />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground mb-1">Install Welile.com</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  {isIOS 
                    ? 'Tap Share then "Add to Home Screen"'
                    : 'Install for quick access & offline use'
                  }
                </p>

                {isIOS ? (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Share className="h-4 w-4" />
                    <span>Share</span>
                    <span className="text-muted-foreground">→</span>
                    <Plus className="h-4 w-4" />
                    <span>Add to Home</span>
                  </div>
                ) : (
                  <Button 
                    onClick={handleInstall}
                    size="sm"
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Install Now
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
