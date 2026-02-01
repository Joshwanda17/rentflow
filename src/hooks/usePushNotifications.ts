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

// Get service worker registration - more reliable with longer timeout
async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  try {
    // First check if we already have a registration
    let reg = await navigator.serviceWorker.getRegistration('/');
    
    if (reg) {
      // Wait for it to be ready if it exists
      if (reg.active) return reg;
      
      // Wait up to 5s for the SW to activate
      const waitForActive = new Promise<ServiceWorkerRegistration | null>((resolve) => {
        if (reg!.active) {
          resolve(reg!);
          return;
        }
        
        const timeout = setTimeout(() => resolve(reg!), 5000);
        
        reg!.addEventListener('updatefound', () => {
          const installing = reg!.installing;
          if (installing) {
            installing.addEventListener('statechange', () => {
              if (installing.state === 'activated') {
                clearTimeout(timeout);
                resolve(reg!);
              }
            });
          }
        });
        
        // Also check if it becomes active
        if (reg!.waiting) {
          reg!.waiting.addEventListener('statechange', function() {
            if (this.state === 'activated') {
              clearTimeout(timeout);
              resolve(reg!);
            }
          });
        }
      });
      
      return await waitForActive;
    }
    
    // No registration exists, create one with 8s timeout
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    
    const registrationPromise = (async () => {
      const newReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      // Wait for it to be ready
      await navigator.serviceWorker.ready;
      return newReg;
    })();
    
    return await Promise.race([registrationPromise, timeoutPromise]);
  } catch (err) {
    console.error('[Push] Service worker registration error:', err);
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

  // Subscribe to push notifications - more reliable with better error handling
  const subscribe = useCallback(async (): Promise<boolean> => {
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
      console.log('[Push] Requesting permission...');
      const perm = await Notification.requestPermission();
      setPermission(perm);
      console.log('[Push] Permission result:', perm);

      if (perm !== 'granted') {
        console.log('[Push] Permission not granted');
        setLoading(false);
        return false;
      }

      // Get registration with better error handling
      console.log('[Push] Getting service worker registration...');
      const registration = await getServiceWorkerRegistration();
      
      if (!registration) {
        console.error('[Push] No service worker registration available');
        toast.error('Please refresh the page and try again');
        setLoading(false);
        return false;
      }
      
      console.log('[Push] Service worker ready, checking subscription...');

      // Get or create subscription
      let subscription = await registration.pushManager.getSubscription();
      console.log('[Push] Existing subscription:', !!subscription);
      
      if (!subscription) {
        try {
          console.log('[Push] Creating new subscription...');
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
          });
          console.log('[Push] Subscription created successfully');
        } catch (subError) {
          console.error('[Push] Subscription error:', subError);
          
          // Check for specific error types
          if (subError instanceof DOMException) {
            if (subError.name === 'NotAllowedError') {
              toast.error('Notifications blocked. Check browser settings.');
            } else if (subError.name === 'AbortError') {
              toast.error('Request timed out. Please try again.');
            } else {
              toast.error('Failed to enable. Please refresh and try again.');
            }
          } else {
            toast.error('Failed to subscribe. Please try again.');
          }
          setLoading(false);
          return false;
        }
      }

      // Save to database - don't block UI but log errors
      saveSubscriptionToDb(subscription, user.id)
        .then(success => {
          if (success) {
            console.log('[Push] Subscription saved to database');
          } else {
            console.warn('[Push] Failed to save subscription to database');
          }
        })
        .catch(err => console.error('[Push] Database save error:', err));
      
      setIsSubscribed(true);
      localStorage.setItem('push-notifications-enabled', 'true');
      toast.success('Notifications enabled! 🔔');
      
      return true;
    } catch (err) {
      console.error('[Push] Subscribe error:', err);
      toast.error('Something went wrong. Please refresh and try again.');
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
