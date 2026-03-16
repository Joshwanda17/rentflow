import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface HouseListing {
  id: string;
  landlord_id?: string | null;
  agent_id?: string;
  title: string;
  description: string | null;
  house_category: string;
  number_of_rooms: number;
  monthly_rent: number;
  daily_rate: number;
  access_fee: number;
  platform_fee: number;
  total_monthly_cost: number;
  region: string;
  district: string | null;
  sub_county?: string | null;
  village?: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  has_water: boolean;
  has_electricity: boolean;
  has_security: boolean;
  has_parking: boolean;
  is_furnished: boolean;
  amenities?: string[] | null;
  image_urls: string[] | null;
  status: string;
  tenant_id?: string | null;
  landlord_accepted?: boolean;
  verified?: boolean | null;
  created_at: string;
  updated_at?: string;
  // Distance from spatial query
  distance_km?: number;
}

interface UseHouseListingsOptions {
  region?: string;
  category?: string;
  maxDailyRate?: number;
  agentId?: string;
  status?: string;
  limit?: number;
}

/**
 * Hook for basic house listings (no spatial query).
 * Used by agent dashboards and non-geo contexts.
 */
export function useHouseListings(options: UseHouseListingsOptions = {}) {
  const [listings, setListings] = useState<HouseListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('house_listings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(options.limit || 50);

      if (options.status) {
        query = query.eq('status', options.status);
      } else {
        query = query.eq('status', 'available');
      }

      if (options.region) {
        query = query.ilike('region', `%${options.region}%`);
      }
      if (options.category) {
        query = query.eq('house_category', options.category);
      }
      if (options.maxDailyRate) {
        query = query.lte('daily_rate', options.maxDailyRate);
      }
      if (options.agentId) {
        query = query.eq('agent_id', options.agentId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setListings((data as any[]) || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options.region, options.category, options.maxDailyRate, options.agentId, options.status, options.limit]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  return { listings, loading, error, refresh: fetchListings };
}

interface UseNearbyHousesOptions {
  latitude: number | null;
  longitude: number | null;
  radiusKm?: number;
  category?: string;
  region?: string;
  limit?: number;
  enabled?: boolean;
}

/**
 * Hook for spatial nearby house search using PostGIS.
 * Falls back to regular query if no GPS coordinates.
 */
export function useNearbyHouses(options: UseNearbyHousesOptions) {
  const [listings, setListings] = useState<HouseListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNearby = useCallback(async () => {
    if (options.enabled === false) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // If we have GPS, use the spatial RPC
      if (options.latitude && options.longitude) {
        const { data, error: rpcError } = await supabase.rpc('find_nearby_houses', {
          user_lat: options.latitude,
          user_lng: options.longitude,
          radius_km: options.radiusKm || 50,
          category_filter: options.category || null,
          region_filter: options.region || null,
          result_limit: options.limit || 50,
        });

        if (rpcError) throw rpcError;
        setListings((data as any[]) || []);
      } else {
        // No GPS — fall back to regular query
        let query = supabase
          .from('house_listings')
          .select('*')
          .eq('status', 'available')
          .order('created_at', { ascending: false })
          .limit(options.limit || 50);

        if (options.region) {
          query = query.ilike('region', `%${options.region}%`);
        }
        if (options.category) {
          query = query.eq('house_category', options.category);
        }

        const { data, error: fetchError } = await query;
        if (fetchError) throw fetchError;
        setListings((data as any[]) || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options.latitude, options.longitude, options.radiusKm, options.category, options.region, options.limit, options.enabled]);

  useEffect(() => {
    fetchNearby();
  }, [fetchNearby]);

  return { listings, loading, error, refresh: fetchNearby };
}

/**
 * Calculate the daily rate for a house listing
 * Formula: (monthly_rent + access_fee + platform_fee) / 30
 */
export function calculateDailyRentalRate(monthlyRent: number) {
  const accessFee = Math.round(monthlyRent * (Math.pow(1.33, 1) - 1)); // 33% for 30 days
  const platformFee = monthlyRent <= 200000 ? 10000 : 20000;
  const totalMonthlyCost = monthlyRent + accessFee + platformFee;
  const dailyRate = Math.ceil(totalMonthlyCost / 30);

  return {
    monthlyRent,
    accessFee,
    platformFee,
    totalMonthlyCost,
    dailyRate,
  };
}
