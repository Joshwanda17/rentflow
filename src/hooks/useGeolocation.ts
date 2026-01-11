import { useState, useEffect } from 'react';

interface LocationData {
  country: string | null;
  city: string | null;
  countryCode: string | null;
  loading: boolean;
  error: string | null;
}

export function useGeolocation(): LocationData {
  const [location, setLocation] = useState<LocationData>({
    country: null,
    city: null,
    countryCode: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        // Use a free IP geolocation API
        const response = await fetch('https://ipapi.co/json/');
        if (!response.ok) {
          throw new Error('Failed to fetch location');
        }
        const data = await response.json();
        
        setLocation({
          country: data.country_name || null,
          city: data.city || null,
          countryCode: data.country_code || null,
          loading: false,
          error: null
        });
      } catch (error) {
        console.error('Geolocation error:', error);
        // Try fallback API
        try {
          const fallbackResponse = await fetch('https://ip-api.com/json/?fields=country,city,countryCode');
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();
            setLocation({
              country: fallbackData.country || null,
              city: fallbackData.city || null,
              countryCode: fallbackData.countryCode || null,
              loading: false,
              error: null
            });
            return;
          }
        } catch {
          // Fallback also failed
        }
        
        setLocation(prev => ({
          ...prev,
          loading: false,
          error: 'Could not determine location'
        }));
      }
    };

    fetchLocation();
  }, []);

  return location;
}

// Function to get location data (for use in non-hook contexts)
export async function getLocationData(): Promise<{ country: string | null; city: string | null; countryCode: string | null }> {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('Failed to fetch location');
    const data = await response.json();
    
    return {
      country: data.country_name || null,
      city: data.city || null,
      countryCode: data.country_code || null
    };
  } catch {
    try {
      const fallbackResponse = await fetch('https://ip-api.com/json/?fields=country,city,countryCode');
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        return {
          country: fallbackData.country || null,
          city: fallbackData.city || null,
          countryCode: fallbackData.countryCode || null
        };
      }
    } catch {
      // Fallback also failed
    }
    
    return { country: null, city: null, countryCode: null };
  }
}
