import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { toast } from 'sonner';

const SESSION_KEY = 'welile_install_card_dismissed';

interface InstallAppCardProps {
  className?: string;
}

export default function InstallAppCard({ className }: InstallAppCardProps) {
  const { canShow, isInstalled, isIOS, hasPrompt, promptInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(SESSION_KEY) === '1';
  });
  const [isInstalling, setIsInstalling] = useState(false);

  // Auto-hide after install
  useEffect(() => {
    if (isInstalled) setDismissed(true);
  }, [isInstalled]);

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (isIOS) {
      toast('Tap the Share button, then "Add to Home Screen"', { duration: 6000 });
      handleDismiss();
      return;
    }
    if (!hasPrompt || isInstalling) return;

    setIsInstalling(true);
    try {
      const accepted = await promptInstall();
      if (accepted) {
        toast.success('App installed successfully!');
        handleDismiss();
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

  return (
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
  );
}
