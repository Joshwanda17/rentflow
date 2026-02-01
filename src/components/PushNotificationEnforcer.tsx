import { useEffect, useState } from 'react';
import { Bell, BellRing, Shield, Smartphone, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/hooks/useAuth';

/**
 * Push Notification Permission Prompt
 * Shows once per session, with skip option for users who can't enable
 */
export function PushNotificationEnforcer() {
  const { user } = useAuth();
  const { isSupported, isSubscribed, permission, subscribe, loading } = usePushNotifications();
  const [showEnforcer, setShowEnforcer] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [currentPermission, setCurrentPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
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
    
    // Permission denied in browser - can't ask again
    if (currentPermission === 'denied') {
      setShowEnforcer(false);
      return;
    }

    // Check if user skipped this session
    const skippedThisSession = sessionStorage.getItem('push-notification-skipped');
    if (skippedThisSession) {
      setShowEnforcer(false);
      return;
    }

    // Show enforcer after short delay for smoother UX
    const timer = setTimeout(() => setShowEnforcer(true), 500);
    return () => clearTimeout(timer);
  }, [user, isSupported, isSubscribed, currentPermission]);

  const handleEnable = async () => {
    if (isEnabling || loading) return;
    
    setIsEnabling(true);
    setHasAttempted(true);
    
    try {
      const success = await subscribe();
      
      if (success) {
        setShowEnforcer(false);
      } else {
        if ('Notification' in window) {
          const newPermission = Notification.permission;
          setCurrentPermission(newPermission);
          if (newPermission === 'denied') {
            setShowEnforcer(false);
          }
        }
      }
    } catch (err) {
      console.error('[Push Enforcer] Error:', err);
    } finally {
      setIsEnabling(false);
    }
  };

  const handleSkip = () => {
    sessionStorage.setItem('push-notification-skipped', 'true');
    setShowEnforcer(false);
  };

  if (!showEnforcer) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-card border-2 border-primary/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
        {/* Skip button */}
        <button
          onClick={handleSkip}
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted/50 text-muted-foreground"
          aria-label="Skip for now"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Bell icon */}
        <div className="flex justify-center mb-4">
          <div className="p-4 rounded-full bg-gradient-to-br from-primary/30 to-primary/10">
            <BellRing className="h-12 w-12 text-primary" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-center mb-2">
          Enable Notifications 🔔
        </h2>

        {/* Description */}
        <p className="text-center text-muted-foreground text-sm mb-4">
          Stay updated with instant alerts about:
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
              <div className="animate-spin">
                <Bell className="h-5 w-5" />
              </div>
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
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-amber-600 dark:text-amber-400 text-xs">
              Please tap <strong>"Allow"</strong> in the browser popup to continue.
            </p>
          </div>
        )}

        {/* Skip link */}
        <button
          onClick={handleSkip}
          className="w-full text-center text-xs text-muted-foreground/70 mt-4 py-2 hover:text-muted-foreground"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
