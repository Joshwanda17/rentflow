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
  is_frozen?: boolean;
  frozen_reason?: string | null;
  territory?: string | null;
  is_seller?: boolean;
  seller_application_status?: string | null;
}
// Module-level cache to deduplicate across component instances
let profileCache: { data: Profile; userId: string; timestamp: number } | null = null;
const PROFILE_CACHE_TTL = 60_000; // 1 minute

export function useProfile() {
  const { user } = useAuth();
  const cached = user && profileCache && profileCache.userId === user.id && (Date.now() - profileCache.timestamp < PROFILE_CACHE_TTL)
    ? profileCache.data : null;
  const [profile, setProfile] = useState<Profile | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [isOfflineData, setIsOfflineData] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    // Check module-level cache first
    if (profileCache && profileCache.userId === user.id && (Date.now() - profileCache.timestamp < PROFILE_CACHE_TTL)) {
      setProfile(profileCache.data);
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
          .select('id, full_name, email, phone, avatar_url, verified, is_frozen, frozen_reason, territory')
          .eq('id', user.id)
          .maybeSingle();

        if (!error && data) {
          setProfile(data);
          setIsOfflineData(false);
          profileCache = { data, userId: user.id, timestamp: Date.now() };
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
      .select('id, full_name, email, phone, avatar_url, verified, is_frozen, frozen_reason')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      setProfile(data);
      setIsOfflineData(false);
      profileCache = { data, userId: user.id, timestamp: Date.now() };
      await cacheProfile(data);
    }
  }, [user]);

  return { profile, loading, refreshProfile, isOfflineData };
}
