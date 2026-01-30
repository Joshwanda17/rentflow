import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, X, Shield, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/hooks/useAuth';

const ENFORCEMENT_KEY = 'push_notification_decision';
const SNOOZE_KEY = 'push_notification_snooze';
const SNOOZE_DURATION = 2 * 60 * 60 * 1000; // 2 hours snooze max

export function PushNotificationEnforcer() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, permission, subscribe, loading } = usePushNotifications();
  const [showEnforcer, setShowEnforcer] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!isSupported) return;
    if (isSubscribed) return;
    if (permission === 'denied') return;

    // Check if user already made a decision
    const decision = localStorage.getItem(ENFORCEMENT_KEY);
    if (decision === 'enabled') return;

    // Check if snoozed
    const snoozeTime = localStorage.getItem(SNOOZE_KEY);
    if (snoozeTime) {
      const snoozeExpiry = parseInt(snoozeTime);
      if (Date.now() < snoozeExpiry) {
        // Still in snooze period, but show after snooze expires
        const remainingTime = snoozeExpiry - Date.now();
        const timer = setTimeout(() => setShowEnforcer(true), remainingTime);
        return () => clearTimeout(timer);
      }
    }

    // Show enforcer after a brief delay
    const timer = setTimeout(() => setShowEnforcer(true), 1500);
    return () => clearTimeout(timer);
  }, [user, isSupported, isSubscribed, permission]);

  const handleEnable = async () => {
    setIsEnabling(true);
    const success = await subscribe();
    setIsEnabling(false);
    
    if (success) {
      localStorage.setItem(ENFORCEMENT_KEY, 'enabled');
      setShowEnforcer(false);
    }
  };

  const handleSnooze = () => {
    // Allow snooze but it comes back in 2 hours
    localStorage.setItem(SNOOZE_KEY, (Date.now() + SNOOZE_DURATION).toString());
    setShowEnforcer(false);
  };

  if (!showEnforcer) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
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
              className="p-4 rounded-full bg-primary/20"
            >
              <BellRing className="h-12 w-12 text-primary" />
            </motion.div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-center mb-2">
            Stay Connected! 🔔
          </h2>

          {/* Description */}
          <p className="text-center text-muted-foreground text-sm mb-4">
            Enable notifications to receive instant updates about:
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
            className="w-full h-12 text-base font-semibold gap-2 mb-3"
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

          {/* Snooze option */}
          <Button
            variant="ghost"
            onClick={handleSnooze}
            className="w-full text-muted-foreground text-sm"
          >
            Remind me later
          </Button>

          <p className="text-center text-xs text-muted-foreground mt-3">
            You can change this in settings anytime
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
