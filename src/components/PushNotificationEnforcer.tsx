import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, Shield, Smartphone, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/hooks/useAuth';

/**
 * Mandatory Push Notification Permission Enforcer
 * 
 * This component blocks the UI until the user either:
 * 1. Enables push notifications (grants permission)
 * 2. Explicitly denies in the browser popup (permission = 'denied')
 * 
 * There is NO snooze or dismiss option - users MUST make a choice.
 * It re-appears on every visit if notifications aren't enabled.
 */
export function PushNotificationEnforcer() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, permission, subscribe, loading } = usePushNotifications();
  const [showEnforcer, setShowEnforcer] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [currentPermission, setCurrentPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    // Update permission state when it changes
    if ('Notification' in window) {
      setCurrentPermission(Notification.permission);
    }
  }, [permission]);

  useEffect(() => {
    if (!user) {
      setShowEnforcer(false);
      return;
    }
    
    // Not supported - can't show enforcer
    if (!isSupported) {
      setShowEnforcer(false);
      return;
    }
    
    // Already subscribed - don't show
    if (isSubscribed) {
      setShowEnforcer(false);
      return;
    }
    
    // Permission denied in browser - can't ask again, don't show
    if (currentPermission === 'denied') {
      setShowEnforcer(false);
      return;
    }

    // Show enforcer immediately - no delay for faster UX
    setShowEnforcer(true);
  }, [user, isSupported, isSubscribed, currentPermission]);

  const handleEnable = async () => {
    setIsEnabling(true);
    setHasAttempted(true);
    
    const success = await subscribe();
    
    setIsEnabling(false);
    
    if (success) {
      setShowEnforcer(false);
    } else {
      // Check if permission was denied in browser popup
      if ('Notification' in window) {
        setCurrentPermission(Notification.permission);
        if (Notification.permission === 'denied') {
          setShowEnforcer(false);
        }
      }
    }
  };

  if (!showEnforcer) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-card border-2 border-primary/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl"
        >
          {/* Animated bell */}
          <div className="flex justify-center mb-4">
            <motion.div
              animate={{ 
                rotate: [0, -15, 15, -15, 15, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                repeat: Infinity, 
                duration: 2, 
                repeatDelay: 2 
              }}
              className="p-4 rounded-full bg-gradient-to-br from-primary/30 to-primary/10"
            >
              <BellRing className="h-12 w-12 text-primary" />
            </motion.div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-center mb-2">
            Enable Notifications 🔔
          </h2>

          {/* Description */}
          <p className="text-center text-muted-foreground text-sm mb-4">
            Notifications are <span className="font-semibold text-foreground">required</span> to use Welile. 
            Get instant updates about:
          </p>

          {/* Benefits list */}
          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-3 text-sm">
              <div className="p-1.5 rounded-full bg-green-500/20">
                <Shield className="h-4 w-4 text-green-500" />
              </div>
              <span>Payment confirmations & reminders</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="p-1.5 rounded-full bg-blue-500/20">
                <Smartphone className="h-4 w-4 text-blue-500" />
              </div>
              <span>Important account updates</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="p-1.5 rounded-full bg-purple-500/20">
                <Bell className="h-4 w-4 text-purple-500" />
              </div>
              <span>New messages & opportunities</span>
            </div>
          </div>

          {/* Primary action */}
          <Button
            onClick={handleEnable}
            disabled={isEnabling || loading}
            className="w-full h-14 text-lg font-bold gap-2"
            size="lg"
          >
            {isEnabling || loading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                >
                  <Bell className="h-5 w-5" />
                </motion.div>
                Enabling...
              </>
            ) : (
              <>
                <BellRing className="h-5 w-5" />
                Enable Notifications
              </>
            )}
          </Button>

          {/* Error message after failed attempt */}
          {hasAttempted && !isEnabling && !isSubscribed && currentPermission !== 'denied' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-amber-600 dark:text-amber-400 text-xs">
                Please tap <strong>"Allow"</strong> in the browser popup to continue using Welile.
              </p>
            </motion.div>
          )}

          {/* Mandatory notice */}
          <p className="text-center text-xs text-muted-foreground/70 mt-4">
            This is required to receive important updates about your account
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
