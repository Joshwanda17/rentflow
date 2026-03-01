import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { cacheProfile, getCachedProfile } from '@/lib/offlineDataStorage';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  verified: boolean;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOfflineData, setIsOfflineData] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Try to get cached data first for instant display
    try {
      const cached = await getCachedProfile(user.id);
      if (cached) {
        setProfile(cached);
        setIsOfflineData(true);
      }
    } catch (e) {
      console.warn('[useProfile] Failed to get cached profile:', e);
    }

    // Fetch fresh data if online
    if (navigator.onLine) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, avatar_url, verified')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data) {
          setProfile(data);
          setIsOfflineData(false);
          // Cache for offline use
          await cacheProfile(data);
        }
      } catch (e) {
        console.warn('[useProfile] Failed to fetch profile:', e);
      }
    }
    
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    
    if (!navigator.onLine) {
      return; // Don't try to refresh when offline
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, avatar_url, verified')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      setProfile(data);
      setIsOfflineData(false);
      await cacheProfile(data);
    }
  }, [user]);

  return { profile, loading, refreshProfile, isOfflineData };
}
