import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// VAPID public key - generated for Welile push notifications
// This must be a valid P-256 EC public key in uncompressed format (65 bytes), base64url encoded
const VAPID_PUBLIC_KEY = 'BGtkbcjrO12YMoDuq2sCQeHlu47uPx3SHTgFKZFYiBW8Qr0D9vgyZSZPdw6_4ZFEI9Snk1VEAj2qTYI1I1YxBXE';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Get service worker registration quickly - don't wait for ready state
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  try {
    // Use existing registration or register new one with 3s timeout
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    
    const registrationPromise = (async () => {
      let reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }
      return reg;
    })();
    
    return await Promise.race([registrationPromise, timeoutPromise]);
  } catch {
    return null;
  }
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);

  // Check if push notifications are supported - sync check for speed
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 
                      'PushManager' in window && 
                      'Notification' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Check existing subscription
  useEffect(() => {
    if (!isSupported || !user) return;

    const checkSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
        
        // If subscribed locally but not in DB, sync it
        if (subscription) {
          const { data } = await supabase
            .from('push_subscriptions')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
            
          if (!data) {
            // Re-save subscription to DB
            await saveSubscriptionToDb(subscription, user.id);
          }
        }
      } catch (error) {
        console.error('[Push] Error checking subscription:', error);
      }
    };

    checkSubscription();
  }, [isSupported, user]);

  // Save subscription to database
  const saveSubscriptionToDb = async (subscription: PushSubscription, userId: string): Promise<boolean> => {
    try {
      const subscriptionJson = subscription.toJSON();
      const endpoint = subscriptionJson.endpoint || '';
      const p256dh = subscriptionJson.keys?.p256dh || '';
      const auth = subscriptionJson.keys?.auth || '';

      if (!endpoint || !p256dh || !auth) {
        console.error('[Push] Invalid subscription keys');
        return false;
      }

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('[Push] Database error:', error);
        return false;
      }

      console.log('[Push] Subscription saved to database');
      return true;
    } catch (error) {
      console.error('[Push] Error saving subscription:', error);
      return false;
    }
  };

  // Subscribe to push notifications - optimized for speed
  const subscribe = useCallback(async () => {
    if (!user) {
      toast.error('Please log in to enable notifications');
      return false;
    }

    if (!isSupported) {
      toast.error('Push notifications are not supported on this browser');
      return false;
    }

    setLoading(true);
    
    try {
      // Request permission first - this is the user-facing step
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setLoading(false);
        return false;
      }

      // Get registration quickly with timeout
      const registration = await getServiceWorkerRegistration();
      if (!registration) {
        toast.error('Service worker unavailable. Please refresh.');
        setLoading(false);
        return false;
      }

      // Get or create subscription with timeout
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
          });
        } catch {
          toast.error('Failed to subscribe. Please try again.');
          setLoading(false);
          return false;
        }
      }

      // Save to database in background - don't block UI
      saveSubscriptionToDb(subscription, user.id).catch(() => {});
      
      setIsSubscribed(true);
      localStorage.setItem('push-notifications-enabled', 'true');
      toast.success('Notifications enabled! 🔔');
      
      return true;
    } catch {
      toast.error('Failed to enable notifications');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, user]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!isSupported || !user) return false;

    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      // Remove from database
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id);

      setIsSubscribed(false);
      localStorage.removeItem('push-notifications-enabled');
      toast.success('Push notifications disabled');
      return true;
    } catch (error) {
      console.error('[Push] Error unsubscribing:', error);
      toast.error('Failed to disable push notifications');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, user]);

  // Auto-prompt for notifications (can be called on dashboard load)
  const promptIfNeeded = useCallback(async () => {
    if (!isSupported || !user || isSubscribed) return;
    
    // Only prompt if permission is 'default' (not yet asked)
    if (permission === 'default') {
      // Small delay to not be intrusive
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Show a friendly prompt first
      toast('Enable notifications?', {
        description: 'Get instant updates about your rent, payments, and more',
        icon: '🔔',
        duration: 10000,
        action: {
          label: 'Enable',
          onClick: () => subscribe()
        }
      });
    }
  }, [isSupported, user, isSubscribed, permission, subscribe]);

  return {
    isSupported,
    isSubscribed,
    permission,
    loading,
    subscribe,
    unsubscribe,
    promptIfNeeded
  };
}
