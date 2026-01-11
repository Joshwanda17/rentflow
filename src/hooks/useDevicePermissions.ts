import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface PermissionStatus {
  location: 'granted' | 'denied' | 'prompt' | 'unsupported';
  notifications: 'granted' | 'denied' | 'prompt' | 'unsupported';
}

interface DevicePermissions {
  permissions: PermissionStatus;
  requestLocationPermission: () => Promise<boolean>;
  requestNotificationPermission: () => Promise<boolean>;
  makePhoneCall: (phoneNumber: string) => void;
  sendSMS: (phoneNumber: string, message?: string) => void;
  openWhatsApp: (phoneNumber: string, message?: string) => void;
  getCurrentLocation: () => Promise<GeolocationPosition | null>;
}

export function useDevicePermissions(): DevicePermissions {
  const [permissions, setPermissions] = useState<PermissionStatus>({
    location: 'prompt',
    notifications: 'prompt',
  });

  // Request location permission and get current position
  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    if (!navigator.geolocation) {
      setPermissions(prev => ({ ...prev, location: 'unsupported' }));
      toast.error('Location is not supported on this device');
      return false;
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      
      if (result.state === 'granted') {
        setPermissions(prev => ({ ...prev, location: 'granted' }));
        toast.success('Location access granted');
        return true;
      }
      
      if (result.state === 'denied') {
        setPermissions(prev => ({ ...prev, location: 'denied' }));
        toast.error('Location access denied. Please enable in settings.');
        return false;
      }

      // Prompt for permission by requesting location
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            setPermissions(prev => ({ ...prev, location: 'granted' }));
            toast.success('Location access granted');
            resolve(true);
          },
          (error) => {
            if (error.code === error.PERMISSION_DENIED) {
              setPermissions(prev => ({ ...prev, location: 'denied' }));
              toast.error('Location access denied');
            }
            resolve(false);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    } catch {
      // Fallback for browsers that don't support permissions API
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => {
            setPermissions(prev => ({ ...prev, location: 'granted' }));
            toast.success('Location access granted');
            resolve(true);
          },
          () => {
            setPermissions(prev => ({ ...prev, location: 'denied' }));
            toast.error('Location access denied');
            resolve(false);
          }
        );
      });
    }
  }, []);

  // Request notification permission
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      setPermissions(prev => ({ ...prev, notifications: 'unsupported' }));
      toast.error('Notifications are not supported on this device');
      return false;
    }

    if (Notification.permission === 'granted') {
      setPermissions(prev => ({ ...prev, notifications: 'granted' }));
      return true;
    }

    if (Notification.permission === 'denied') {
      setPermissions(prev => ({ ...prev, notifications: 'denied' }));
      toast.error('Notifications blocked. Please enable in settings.');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      const granted = result === 'granted';
      setPermissions(prev => ({ ...prev, notifications: granted ? 'granted' : 'denied' }));
      
      if (granted) {
        toast.success('Notifications enabled');
        // Show a test notification
        new Notification('Welile', {
          body: 'Notifications are now enabled!',
          icon: '/welile-logo.png'
        });
      } else {
        toast.error('Notifications were not enabled');
      }
      
      return granted;
    } catch {
      toast.error('Failed to request notification permission');
      return false;
    }
  }, []);

  // Make a phone call
  const makePhoneCall = useCallback((phoneNumber: string) => {
    const cleanNumber = phoneNumber.replace(/[^+\d]/g, '');
    window.location.href = `tel:${cleanNumber}`;
  }, []);

  // Send SMS
  const sendSMS = useCallback((phoneNumber: string, message?: string) => {
    const cleanNumber = phoneNumber.replace(/[^+\d]/g, '');
    const smsUrl = message 
      ? `sms:${cleanNumber}?body=${encodeURIComponent(message)}`
      : `sms:${cleanNumber}`;
    window.location.href = smsUrl;
  }, []);

  // Open WhatsApp
  const openWhatsApp = useCallback((phoneNumber: string, message?: string) => {
    const cleanNumber = phoneNumber.replace(/[^+\d]/g, '');
    const waUrl = message
      ? `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`
      : `https://wa.me/${cleanNumber}`;
    window.open(waUrl, '_blank');
  }, []);

  // Get current GPS location
  const getCurrentLocation = useCallback(async (): Promise<GeolocationPosition | null> => {
    if (!navigator.geolocation) {
      toast.error('Location is not supported');
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(position);
        },
        (error) => {
          console.error('Location error:', error);
          if (error.code === error.PERMISSION_DENIED) {
            toast.error('Location access denied. Please enable in settings.');
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            toast.error('Location unavailable');
          } else if (error.code === error.TIMEOUT) {
            toast.error('Location request timed out');
          }
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000
        }
      );
    });
  }, []);

  return {
    permissions,
    requestLocationPermission,
    requestNotificationPermission,
    makePhoneCall,
    sendSMS,
    openWhatsApp,
    getCurrentLocation,
  };
}
