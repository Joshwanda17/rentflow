import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/hooks/useAuth';

export function PushNotificationPrompt() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, permission, subscribe, loading } = usePushNotifications();
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't show if not supported, already subscribed, or user not logged in
    if (!isSupported || isSubscribed || !user) return;
    
    // Check if user has previously dismissed the prompt
    const dismissedBefore = localStorage.getItem('push-prompt-dismissed');
    if (dismissedBefore) {
      const dismissedTime = parseInt(dismissedBefore);
      // Show again after 7 days
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // Only show if permission is 'default' (not yet asked or denied)
    if (permission !== 'default') return;

    // Show prompt after a delay
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [isSupported, isSubscribed, user, permission]);

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('push-prompt-dismissed', Date.now().toString());
    setTimeout(() => setShowPrompt(false), 300);
  };

  if (!showPrompt) return null;

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.9 }}
          className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50"
        >
          <div className="bg-card border-2 border-primary/20 rounded-2xl p-4 shadow-xl">
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>

            <div className="flex items-start gap-3">
              {/* Animated bell icon */}
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                transition={{ repeat: Infinity, duration: 2, repeatDelay: 3 }}
                className="p-3 rounded-xl bg-primary/10 shrink-0"
              >
                <BellRing className="h-6 w-6 text-primary" />
              </motion.div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm">Stay Updated!</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Get instant notifications for rent updates, payments, and important alerts.
                </p>

                <div className="flex items-center gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={handleEnable}
                    disabled={loading}
                    className="gap-1.5 h-8"
                  >
                    {loading ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      >
                        <Bell className="h-3.5 w-3.5" />
                      </motion.div>
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Enable Notifications
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDismiss}
                    className="h-8 text-muted-foreground"
                  >
                    Later
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
