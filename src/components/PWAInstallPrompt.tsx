import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { toast } from 'sonner';

export default function PWAInstallPrompt() {
  const { isInstallable, isInstalled, promptInstall, hasPrompt } = usePWAInstall();
  const [visible, setVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Show button only when native prompt is available, after a 2s delay
  useEffect(() => {
    if (isInstalled) {
      setVisible(false);
      return;
    }

    if (isInstallable || hasPrompt) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }

    setVisible(false);
  }, [isInstalled, isInstallable, hasPrompt]);

  const handleInstall = async () => {
    if (isInstalling) return;
    setIsInstalling(true);

    try {
      const accepted = await promptInstall();
      if (accepted) {
        setVisible(false);
        toast.success('App installed successfully!');
      } else {
        // Prompt dismissed — hide since prompt is consumed
        setVisible(false);
      }
    } catch (error) {
      console.error('[PWA] Install error:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  if (isInstalled || !visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="bg-card border border-border rounded-2xl shadow-xl p-4 flex items-center gap-3">
            <img
              src="/welile-logo.png"
              alt="Welile"
              className="w-10 h-10 rounded-xl flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Install Welile</p>
              <p className="text-xs text-muted-foreground">Fast access from your home screen</p>
            </div>
            <Button
              onClick={handleInstall}
              size="sm"
              disabled={isInstalling}
              className="gap-1.5 font-semibold touch-manipulation active:scale-95 transition-transform flex-shrink-0"
              style={{ WebkitTapHighlightColor: 'transparent', fontSize: '14px' }}
            >
              <Download className="h-4 w-4" />
              {isInstalling ? '...' : 'Install'}
            </Button>
            <button
              onClick={() => setVisible(false)}
              className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
