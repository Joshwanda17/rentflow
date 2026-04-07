import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { toast } from 'sonner';

export default function PWAInstallPrompt() {
  const { canShow, isInstalled, isIOS, hasPrompt, promptInstall } = usePWAInstall();
  const [visible, setVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const autoPromptedRef = useRef(false);

  // Auto-trigger the native browser install prompt on first visit
  useEffect(() => {
    if (isInstalled || !hasPrompt || autoPromptedRef.current) return;
    autoPromptedRef.current = true;

    const timer = setTimeout(async () => {
      const accepted = await promptInstall();
      if (accepted) {
        toast.success('App installed!');
      }
      // If dismissed, the floating banner will appear via the canShow logic below
    }, 1500);

    return () => clearTimeout(timer);
  }, [isInstalled, hasPrompt, promptInstall]);

  useEffect(() => {
    if (isInstalled) { setVisible(false); return; }
    if (!canShow) { setVisible(false); return; }

    // Show floating banner after a delay (fallback if native prompt was dismissed)
    const timer = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(timer);
  }, [isInstalled, canShow]);

  // Re-show the prompt periodically if dismissed but not installed
  useEffect(() => {
    if (isInstalled || !canShow) return;
    const interval = setInterval(() => {
      if (!isInstalled) setVisible(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [isInstalled, canShow]);

  const handleInstall = async () => {
    if (isIOS) {
      toast('Tap the Share button, then Add to Home Screen', { duration: 5000 });
      setVisible(false);
      return;
    }

    if (isInstalling) return;
    setIsInstalling(true);
    try {
      const accepted = await promptInstall();
      if (accepted) {
        toast.success('App installed!');
        setVisible(false);
        return;
      }

      toast('Open in your browser and use Install app / Add to Home Screen', { duration: 5000 });
      setVisible(false);
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
            <img src="/welile-logo.png" alt="Welile" className="w-10 h-10 rounded-xl flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Install Welile</p>
              <p className="text-xs text-muted-foreground">
                {isIOS ? 'Tap Share → Add to Home Screen' : 'Fast access from your home screen'}
              </p>
            </div>
            <Button
              onClick={handleInstall}
              size="sm"
              disabled={isInstalling}
              className="gap-1.5 font-semibold flex-shrink-0"
            >
              {isIOS ? <Share className="h-4 w-4" /> : <Download className="h-4 w-4" />}
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
