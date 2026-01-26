import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  address?: string;
  city?: string;
  country?: string;
}

export function useLocationTracking() {
  const { user } = useAuth();
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const captureLocation = useCallback(async () => {
    if (!user) return;
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000 // Cache for 1 minute
        });
      });

      const locationData: LocationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };

      // Try to get address using reverse geocoding (free Nominatim API)
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${locationData.latitude}&lon=${locationData.longitude}&zoom=18&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        if (response.ok) {
          const data = await response.json();
          locationData.address = data.display_name;
          locationData.city = data.address?.city || data.address?.town || data.address?.village || data.address?.county;
          locationData.country = data.address?.country;
        }
      } catch (geocodeError) {
        console.warn('Geocoding failed:', geocodeError);
      }

      // Save to database
      const { error: insertError } = await supabase
        .from('user_locations')
        .insert({
          user_id: user.id,
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          address: locationData.address,
          city: locationData.city,
          country: locationData.country
        });

      if (insertError) throw insertError;

      setLocation(locationData);
      setPermissionDenied(false);
    } catch (err: any) {
      if (err.code === 1) {
        setPermissionDenied(true);
        setError('Location permission denied');
      } else if (err.code === 2) {
        setError('Location unavailable');
      } else if (err.code === 3) {
        setError('Location request timed out');
      } else {
        setError(err.message || 'Failed to get location');
      }
      console.error('Location error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Auto-capture on mount/login
  useEffect(() => {
    if (user) {
      // Small delay to ensure smooth page load
      const timer = setTimeout(() => {
        captureLocation();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [user, captureLocation]);

  return {
    location,
    loading,
    error,
    permissionDenied,
    captureLocation
  };
}
