import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface HouseListing {
  id: string;
  landlord_id: string | null;
  agent_id: string;
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
  sub_county: string | null;
  village: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  has_water: boolean;
  has_electricity: boolean;
  has_security: boolean;
  has_parking: boolean;
  is_furnished: boolean;
  amenities: string[] | null;
  image_urls: string[] | null;
  status: string;
  tenant_id: string | null;
  landlord_accepted: boolean;
  verified: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  agent_name?: string;
  landlord_name?: string;
}

interface UseHouseListingsOptions {
  region?: string;
  category?: string;
  maxDailyRate?: number;
  agentId?: string;
  landlordPhone?: string;
  status?: string;
  limit?: number;
}

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
