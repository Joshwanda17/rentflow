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

// Register service worker if not already registered
async function ensureServiceWorkerRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.error('[Push] Service workers not supported');
    return null;
  }

  try {
    // Check if already registered
    let registration = await navigator.serviceWorker.getRegistration('/');
    
    if (!registration) {
      console.log('[Push] Registering service worker...');
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[Push] Service worker registered:', registration.scope);
    }

    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
    console.log('[Push] Service worker is ready');
    
    return registration;
  } catch (error) {
    console.error('[Push] Service worker registration failed:', error);
    return null;
  }
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);

  // Check if push notifications are supported
  useEffect(() => {
    const checkSupport = async () => {
      const supported = 'serviceWorker' in navigator && 
                        'PushManager' in window && 
                        'Notification' in window;
      setIsSupported(supported);
      
      if (supported) {
        setPermission(Notification.permission);
        // Pre-register service worker
        await ensureServiceWorkerRegistered();
      }
    };
    
    checkSupport();
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

  // Subscribe to push notifications
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
      // Step 1: Request notification permission
      console.log('[Push] Requesting permission...');
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        toast.error('Notification permission denied. Please enable in browser settings.');
        setLoading(false);
        return false;
      }

      console.log('[Push] Permission granted');

      // Step 2: Ensure service worker is ready
      const registration = await ensureServiceWorkerRegistered();
      if (!registration) {
        toast.error('Could not register service worker. Please refresh and try again.');
        setLoading(false);
        return false;
      }

      // Step 3: Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        console.log('[Push] Creating new subscription...');
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
          });
          console.log('[Push] Subscription created:', subscription.endpoint);
        } catch (subscribeError: any) {
          console.error('[Push] Subscription error:', subscribeError);
          
          // Handle specific errors
          if (subscribeError.message?.includes('permission')) {
            toast.error('Notifications blocked. Please enable in browser settings.');
          } else if (subscribeError.message?.includes('key')) {
            toast.error('Push service configuration error. Please try again later.');
          } else {
            toast.error('Failed to subscribe. Please try again.');
          }
          setLoading(false);
          return false;
        }
      }

      // Step 4: Save to database
      const saved = await saveSubscriptionToDb(subscription, user.id);
      
      if (!saved) {
        toast.error('Could not save notification settings. Please try again.');
        setLoading(false);
        return false;
      }

      setIsSubscribed(true);
      toast.success('Push notifications enabled!', {
        icon: '🔔',
        description: 'You will now receive instant alerts on this device'
      });
      
      // Mark as enabled in localStorage for the enforcer
      localStorage.setItem('push-notifications-enabled', 'true');
      
      return true;
    } catch (error: any) {
      console.error('[Push] Subscribe error:', error);
      toast.error(error.message || 'Failed to enable push notifications');
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
