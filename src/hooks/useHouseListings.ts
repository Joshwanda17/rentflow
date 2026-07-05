import { useState, useEffect, useCallback, useRef } from 'react';
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
  video_url?: string | null;
  tenant_id?: string | null;
  landlord_accepted?: boolean;
  verified?: boolean | null;
  created_at: string;
  updated_at?: string;
  short_code?: string | null;
  verified_at?: string | null;
  // Bonus tracking
  listed_bonus_paid?: boolean | null;
  listed_bonus_paid_at?: string | null;
  listing_bonus_paid?: boolean | null;
  listing_bonus_paid_at?: string | null;
  // Distance from spatial query
  distance_km?: number;
  // Agent contact (enriched client-side)
  agent_phone?: string | null;
  agent_name?: string | null;
  agent_rating?: number | null;
}

/**
 * Enrich listings with the listing agent's phone/name.
 *
 * Tenants cannot read other users' `profiles` rows directly (RLS), so we use the
 * `get_listing_agent_contacts` SECURITY DEFINER RPC, which only returns the
 * contact of the agent who listed an available house. This is what powers the
 * "Chat on WhatsApp" button on the tenant dashboard.
 */
async function enrichWithAgentInfo(listings: HouseListing[]): Promise<HouseListing[]> {
  const listingIds = [...new Set(listings.map(l => l.id).filter(Boolean))] as string[];
  if (!listingIds.length) return listings;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).rpc('get_listing_agent_contacts', {
    p_listing_ids: listingIds,
  });
  if (!data) return listings;
  const map = new Map<string, { full_name: string | null; phone: string | null; avg_rating: number | null }>(
    (data as any[]).map((r) => [r.listing_id, { full_name: r.full_name, phone: r.phone, avg_rating: r.avg_rating }])
  );
  return listings.map(l => {
    const agent = map.get(l.id);
    return { ...l, agent_phone: agent?.phone ?? null, agent_name: agent?.full_name ?? null, agent_rating: agent?.avg_rating ?? null };
  });
}

/**
 * A listing is only shown to tenants / the public if it has at least one real
 * uploaded photo. Listings with no photos (e.g. empty houses logged by agents
 * before photographing them) are hidden from the marketplace until a photo is
 * added. Agents still see their own photo-less listings in their own views.
 */
export function listingHasRealPhoto(l: { image_urls?: string[] | null }): boolean {
  return Array.isArray(l.image_urls) && l.image_urls.some(u => typeof u === 'string' && u.trim().length > 0);
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
      } else if (!options.agentId) {
        // Default to only "available" for public/marketplace queries.
        // When an agent is viewing THEIR OWN listings, show every status
        // (available, occupied, rejected, etc.) so they can manage them all.
        query = query.eq('status', 'available');
      }

      // Hide houses that landlord ops has hidden — only when not viewing
      // an agent's own listings (agents must still see/manage their hidden ones).
      if (!options.agentId) {
        query = query.eq('is_hidden', false);
      }

      // A listing is only shown publicly once Landlord Ops (admin) has approved
      // it (verified = true). Unverified listings stay out of the marketplace.
      // Agents still see all of their own listings regardless of approval state.
      if (!options.agentId) {
        query = query.eq('verified', true);
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
      let rows = ((data as any[]) || []) as HouseListing[];
      // Public/marketplace views must only show houses that have real photos.
      // Agents viewing their own listings still see everything so they can add photos.
      if (!options.agentId) {
        rows = rows.filter(listingHasRealPhoto);
      }
      const enriched = await enrichWithAgentInfo(rows);
      setListings(enriched);
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
  /**
   * When true, fetch EVERY matching listing by paging through the source
   * instead of relying on a single fixed cap. Results stream in page-by-page,
   * ordered by GPS distance. Use this for full browse views (tenant/funder
   * "Available Houses"). Leave off for bounded previews that intentionally show
   * a small number (they pass `limit`).
   */
  paginate?: boolean;
  /** Rows fetched per page when `paginate` is true. Defaults to 500. */
  pageSize?: number;
  /** Hard safety ceiling so a runaway dataset can't fetch unbounded. Defaults to 20000. */
  maxResults?: number;
}

/**
 * Hook for spatial nearby house search using PostGIS.
 *
 * Falls back to a regular query when there are no GPS coordinates (or if the
 * spatial RPC is unavailable). When `paginate` is true it pages through the
 * ENTIRE matching result set — GPS-distance ordered — so browse views never
 * silently truncate at a fixed cap. Pages are appended as they arrive; the
 * first page clears the loading state so the UI paints quickly while the rest
 * loads in the background.
 */
export function useNearbyHouses(options: UseNearbyHousesOptions) {
  const [listings, setListings] = useState<HouseListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cancels stale in-flight pagination when the query params change.
  const runIdRef = useRef(0);

  const fetchNearby = useCallback(async () => {
    if (options.enabled === false) {
      setLoading(false);
      return;
    }

    const runId = ++runIdRef.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);

    try {
      const paginate = options.paginate === true;
      const hasGps = !!(options.latitude && options.longitude);
      const maxResults = options.maxResults && options.maxResults > 0 ? options.maxResults : 20000;
      const pageSize = paginate
        ? (options.pageSize && options.pageSize > 0 ? options.pageSize : 500)
        : (options.limit || 50);

      // Try the spatial RPC first when we have GPS; if the very first page
      // errors we fall back to the plain query for the whole run.
      let useRpc = hasGps;
      const accumulated: HouseListing[] = [];
      let offset = 0;
      let firstPageDone = false;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const remaining = maxResults - accumulated.length;
        if (remaining <= 0) break;
        const wantLimit = paginate ? Math.min(pageSize, remaining) : pageSize;

        let pageRaw: any[] = [];
        if (useRpc) {
          const { data, error: rpcError } = await supabase.rpc('find_nearby_houses', {
            user_lat: options.latitude,
            user_lng: options.longitude,
            radius_km: options.radiusKm || 50,
            category_filter: options.category || null,
            region_filter: options.region || null,
            result_limit: wantLimit,
            result_offset: offset,
          });
          if (rpcError) {
            // RPC unavailable — restart from scratch using the fallback query.
            if (offset === 0) { useRpc = false; continue; }
            throw rpcError;
          }
          pageRaw = (data as any[]) || [];
        } else {
          let query = supabase
            .from('house_listings')
            .select('*')
            .eq('status', 'available')
            .eq('verified', true)
            .eq('is_hidden', false)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(offset, offset + wantLimit - 1);
          if (options.region) query = query.ilike('region', `%${options.region}%`);
          if (options.category) query = query.eq('house_category', options.category);
          const { data, error: fetchError } = await query;
          if (fetchError) throw fetchError;
          pageRaw = (data as any[]) || [];
        }

        // Stale run (params changed mid-flight) — abandon without touching state.
        if (runId !== runIdRef.current) return;

        // Public/marketplace views only show houses with real photos. Filter for
        // display, but base pagination on the RAW page size so photo-less rows
        // don't make us stop early.
        const filtered = (pageRaw as HouseListing[]).filter(listingHasRealPhoto);
        const enriched = await enrichWithAgentInfo(filtered);
        if (runId !== runIdRef.current) return;

        accumulated.push(...enriched);
        setListings([...accumulated]);

        // First page rendered — let the UI paint while the rest streams in.
        if (!firstPageDone) {
          firstPageDone = true;
          setLoading(false);
          setLoadingMore(true);
        }

        offset += pageRaw.length;
        const exhausted = pageRaw.length < wantLimit;
        if (!paginate || exhausted) break;
      }

      if (runId === runIdRef.current) {
        // Guarantees state settles even when zero pages were returned.
        setListings([...accumulated]);
      }
    } catch (err: any) {
      if (runId === runIdRef.current) setError(err.message);
    } finally {
      if (runId === runIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [
    options.latitude,
    options.longitude,
    options.radiusKm,
    options.category,
    options.region,
    options.limit,
    options.enabled,
    options.paginate,
    options.pageSize,
    options.maxResults,
  ]);

  useEffect(() => {
    fetchNearby();
  }, [fetchNearby]);

  return { listings, loading, loadingMore, error, refresh: fetchNearby };
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
