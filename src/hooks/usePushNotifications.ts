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

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);

  // Check if push notifications are supported
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
      } catch (error) {
        console.error('Error checking push subscription:', error);
      }
    };

    checkSubscription();
  }, [isSupported, user]);

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!isSupported || !user) {
      toast.error('Push notifications are not supported on this device');
      return false;
    }

    setLoading(true);
    try {
      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        toast.error('Notification permission denied');
        setLoading(false);
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
      });

      // Extract keys
      const subscriptionJson = subscription.toJSON();
      const endpoint = subscriptionJson.endpoint || '';
      const p256dh = subscriptionJson.keys?.p256dh || '';
      const auth = subscriptionJson.keys?.auth || '';

      // Save to database
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      setIsSubscribed(true);
      toast.success('Push notifications enabled!', {
        icon: '🔔',
        description: 'You will now receive notifications on this device'
      });
      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      toast.error('Failed to enable push notifications');
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
      toast.success('Push notifications disabled');
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
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
