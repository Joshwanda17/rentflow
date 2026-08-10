/**
 * Shared Uganda administrative location data layer.
 *
 * Single source of truth for the ug_districts → ug_counties → ug_subcounties →
 * ug_parishes → ug_villages reference tables. Every consumer (house listing,
 * post rent request, and anything added later) goes through these hooks so we
 * never duplicate query logic and never fire per-row lookups.
 *
 * Round-trip discipline (no N+1):
 *  - Each level is fetched ONCE per parent id and cached forever (the data is
 *    static government reference data), so re-opening a dialog or stepping back
 *    and forth in a cascade costs zero extra network calls.
 *  - Village search is one debounced RPC that already returns the whole
 *    district → village chain in a single row — no follow-up lookups.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UgOption {
  id: number;
  name: string;
}

/** Uganda's four official regions. */
export const UG_REGIONS = ['Central', 'Eastern', 'Northern', 'Western'] as const;
export type UgRegion = (typeof UG_REGIONS)[number];

/** A fully-resolved administrative chain for one village. */
export interface UgLocationSelection {
  villageId: number;
  village: string;
  parishId: number;
  parish: string;
  subcountyId: number;
  subcounty: string;
  countyId: number;
  county: string;
  districtId: number;
  district: string;
  /** Region of the district (Central | Eastern | Northern | Western). */
  region: string | null;
  fullPath: string;
}

/** Static reference data — safe to cache for the whole session. */
const STATIC = { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 } as const;

export function useUgDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

async function fetchLevel(table: string, parentCol: string | null, parentId: number | null) {
  let q = supabase.from(table as any).select('id, name').order('name');
  if (parentCol && parentId != null) q = q.eq(parentCol, parentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as UgOption[];
}

export interface UgDistrictOption extends UgOption { region: string | null }

/** All districts, each carrying its region. Optionally filtered by region. */
export function useUgDistricts(region?: string | null) {
  return useQuery({
    queryKey: ['ug', 'districts', region ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('ug_districts' as any).select('id, name, region').order('name');
      if (region) q = q.eq('region', region);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as UgDistrictOption[];
    },
    ...STATIC,
  });
}

export function useUgCounties(districtId: number | null) {
  return useQuery({
    queryKey: ['ug', 'counties', districtId],
    enabled: districtId != null,
    queryFn: () => fetchLevel('ug_counties', 'district_id', districtId),
    ...STATIC,
  });
}

export function useUgSubcounties(countyId: number | null) {
  return useQuery({
    queryKey: ['ug', 'subcounties', countyId],
    enabled: countyId != null,
    queryFn: () => fetchLevel('ug_subcounties', 'county_id', countyId),
    ...STATIC,
  });
}

export function useUgParishes(subcountyId: number | null) {
  return useQuery({
    queryKey: ['ug', 'parishes', subcountyId],
    enabled: subcountyId != null,
    queryFn: () => fetchLevel('ug_parishes', 'subcounty_id', subcountyId),
    ...STATIC,
  });
}

export function useUgVillages(parishId: number | null) {
  return useQuery({
    queryKey: ['ug', 'villages', parishId],
    enabled: parishId != null,
    queryFn: () => fetchLevel('ug_villages', 'parish_id', parishId),
    ...STATIC,
  });
}

type SearchRow = {
  village_id: number; village_name: string;
  parish_id: number; parish_name: string;
  subcounty_id: number; subcounty_name: string;
  county_id: number; county_name: string;
  district_id: number; district_name: string;
  region?: string | null;
  full_path: string;
};

function rowToSelection(r: SearchRow): UgLocationSelection {
  return {
    villageId: r.village_id, village: r.village_name,
    parishId: r.parish_id, parish: r.parish_name,
    subcountyId: r.subcounty_id, subcounty: r.subcounty_name,
    countyId: r.county_id, county: r.county_name,
    districtId: r.district_id, district: r.district_name,
    region: r.region ?? null,
    fullPath: r.full_path,
  };
}

/** One debounced RPC returning villages with their full chain already joined. */
export function useUgVillageSearch(
  query: string,
  limit = 20,
  scope?: { districtId?: number | null; districtName?: string | null },
) {
  const debounced = useUgDebounced(query.trim(), 300);
  const districtId = scope?.districtId ?? null;
  const districtName = (scope?.districtName ?? '').trim() || null;
  return useQuery({
    queryKey: ['ug', 'village-search', debounced, limit, districtId, districtName],
    enabled: debounced.length >= 2,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ug_search_villages' as any, {
        p_query: debounced,
        p_limit: limit,
        p_district_id: districtId,
        p_district_name: districtId != null ? null : districtName,
      });
      if (error) throw error;
      return ((data ?? []) as SearchRow[]).map(rowToSelection);
    },
  });
}

/** Rebuild the whole chain from a stored village id (single round trip). */
export async function resolveUgVillage(villageId: number): Promise<UgLocationSelection | null> {
  const { data, error } = await supabase.rpc('ug_resolve_village' as any, { p_village_id: villageId });
  if (error) throw error;
  const row = (data as SearchRow[] | null)?.[0];
  return row ? rowToSelection(row) : null;
}

/** Human-readable label used consistently across every form. */
export function ugLocationLabel(sel: UgLocationSelection) {
  return sel.fullPath || [sel.village, sel.parish, sel.subcounty, sel.county, sel.district].filter(Boolean).join(', ');
}
