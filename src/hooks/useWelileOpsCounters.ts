import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export type CounterLevel = 'continent' | 'country' | 'city' | 'agent';
export type CounterKind = 'rent' | 'landlord' | 'agent' | 'promissory';
export type CounterWindow = '7d' | '30d' | 'all';

export interface CounterPath {
  continent?: string;
  country?: string;
  city?: string;
}

export interface CounterBreakdownRow {
  bucket_key: string;
  bucket_label: string;
  agent_id: string | null;
  rent_count: number;
  landlord_count: number;
  agent_count: number;
  promissory_count: number;
  total_count: number;
  rent_funded_count: number;
  distinct_agents: number;
  active_agents: number;
}

export interface CounterItemRow {
  item_id: string;
  profile_id: string | null;
  title: string;
  subtitle: string | null;
  created_at: string;
  drawer_tab: 'tenant' | 'agent' | 'landlord';
}

export interface ZoneAgentRow {
  agent_id: string;
  agent_name: string | null;
  agent_phone: string | null;
  rent_count: number;
  rent_funded_count: number;
  landlord_count: number;
  agent_count: number;
  promissory_count: number;
  total_count: number;
  first_activity: string | null;
  last_activity: string | null;
  is_producing: boolean;
}

export interface ZoneLandlordRow {
  landlord_id: string;
  landlord_name: string | null;
  landlord_phone: string | null;
  registered_by: string | null;
  agent_name: string | null;
  rent_count: number;
  rent_funded_count: number;
  first_activity: string | null;
  last_activity: string | null;
  is_producing: boolean;
}

export function counterLevel(path: CounterPath): CounterLevel {
  if (!path.continent) return 'continent';
  if (!path.country) return 'country';
  if (!path.city) return 'city';
  return 'agent';
}

export function windowToISO(w: CounterWindow): string | null {
  if (w === 'all') return null;
  const days = w === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function useOpsCounterBreakdown(path: CounterPath, win: CounterWindow, refetchIntervalMs?: number | false) {
  const level = counterLevel(path);
  const since = windowToISO(win);
  return useQuery({
    queryKey: ['welile-ops-counters', level, path.continent ?? null, path.country ?? null, path.city ?? null, win],
    staleTime: 60_000,
    refetchInterval: refetchIntervalMs || false,
    queryFn: async (): Promise<CounterBreakdownRow[]> => {
      const { data, error } = await supabase.rpc('welile_ops_counter_breakdown' as any, {
        p_level: level,
        p_continent: path.continent ?? null,
        p_country: path.country ?? null,
        p_city: path.city ?? null,
        p_since: since,
      });
      if (error) throw error;
      return (data ?? []) as CounterBreakdownRow[];
    },
  });
}

export function useOpsCounterItems(agentId: string | null, kind: CounterKind | null, win: CounterWindow, refetchIntervalMs?: number | false) {
  const since = windowToISO(win);
  return useQuery({
    enabled: !!agentId && !!kind,
    queryKey: ['welile-ops-counter-items', agentId, kind, win],
    staleTime: 30_000,
    refetchInterval: refetchIntervalMs || false,
    queryFn: async (): Promise<CounterItemRow[]> => {
      const { data, error } = await supabase.rpc('welile_ops_counter_items' as any, {
        p_agent_id: agentId,
        p_kind: kind,
        p_since: since,
      });
      if (error) throw error;
      return (data ?? []) as CounterItemRow[];
    },
  });
}

export function useOpsZoneAgents(path: CounterPath | null, win: CounterWindow, enabled: boolean, refetchIntervalMs?: number | false) {
  const since = windowToISO(win);
  return useQuery({
    enabled: enabled && !!path,
    queryKey: ['welile-ops-zone-agents', path?.continent ?? null, path?.country ?? null, path?.city ?? null, win],
    staleTime: 30_000,
    refetchInterval: refetchIntervalMs || false,
    queryFn: async (): Promise<ZoneAgentRow[]> => {
      const { data, error } = await supabase.rpc('welile_ops_zone_agents' as any, {
        p_continent: path?.continent ?? null,
        p_country: path?.country ?? null,
        p_city: path?.city ?? null,
        p_since: since,
      });
      if (error) throw error;
      return (data ?? []) as ZoneAgentRow[];
    },
  });
}

export function useOpsZoneLandlords(path: CounterPath | null, win: CounterWindow, enabled: boolean, refetchIntervalMs?: number | false) {
  const since = windowToISO(win);
  return useQuery({
    enabled: enabled && !!path,
    queryKey: ['welile-ops-zone-landlords', path?.continent ?? null, path?.country ?? null, path?.city ?? null, win],
    staleTime: 30_000,
    refetchInterval: refetchIntervalMs || false,
    queryFn: async (): Promise<ZoneLandlordRow[]> => {
      const { data, error } = await supabase.rpc('welile_ops_zone_landlords' as any, {
        p_continent: path?.continent ?? null,
        p_country: path?.country ?? null,
        p_city: path?.city ?? null,
        p_since: since,
      });
      if (error) throw error;
      return (data ?? []) as ZoneLandlordRow[];
    },
  });
}

// ===== Mission Board: priority funnel (list empty houses → place tenants → onboard funders) =====

export interface MissionSummary {
  empty_houses_total: number;
  listings_new: number;
  listing_agents: number;
  placements_new: number;
  placements_total: number;
  placement_agents: number;
  funders_new: number;
  funders_total: number;
  funders_activated: number;
  funders_amount: number;
}

export interface MissionAgentRow {
  agent_id: string;
  agent_name: string | null;
  agent_phone: string | null;
  listings_count: number;
  empty_listings: number;
  placements_count: number;
  promissory_count: number;
  promissory_amount: number;
  last_activity: string | null;
}

export function useMissionSummary(win: CounterWindow, refetchIntervalMs?: number | false) {
  const since = windowToISO(win);
  return useQuery({
    queryKey: ['welile-mission-summary', win],
    staleTime: 60_000,
    refetchInterval: refetchIntervalMs || false,
    queryFn: async (): Promise<MissionSummary | null> => {
      const { data, error } = await supabase.rpc('welile_mission_summary' as any, { p_since: since });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as MissionSummary | null;
    },
  });
}

export function useMissionLeaderboard(win: CounterWindow, enabled: boolean, refetchIntervalMs?: number | false) {
  const since = windowToISO(win);
  return useQuery({
    enabled,
    queryKey: ['welile-mission-leaderboard', win],
    staleTime: 60_000,
    refetchInterval: refetchIntervalMs || false,
    queryFn: async (): Promise<MissionAgentRow[]> => {
      const { data, error } = await supabase.rpc('welile_mission_leaderboard' as any, { p_since: since });
      if (error) throw error;
      return (data ?? []) as MissionAgentRow[];
    },
  });
}

// ===== Agent network: aggregated driving-force stats across all 3 priorities =====

export interface MissionAgentNetwork {
  total_agents: number;
  listing_agents: number;
  placement_agents: number;
  funder_agents: number;
  houses_listed: number;
  tenants_placed: number;
  landlords_reached: number;
  funders_total: number;
  top_agent_id: string | null;
  top_agent_name: string | null;
  top_agent_score: number;
}

export function useMissionAgentNetwork(win: CounterWindow, refetchIntervalMs?: number | false) {
  const since = windowToISO(win);
  return useQuery({
    queryKey: ['welile-mission-agent-network', win],
    staleTime: 60_000,
    refetchInterval: refetchIntervalMs || false,
    queryFn: async (): Promise<MissionAgentNetwork | null> => {
      const { data, error } = await supabase.rpc('welile_mission_agent_network' as any, { p_since: since });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as MissionAgentNetwork | null;
    },
  });
}

export interface MissionEmptyHouseRow {
  listing_id: string;
  title: string | null;
  status: string | null;
  monthly_rent: number | null;
  number_of_rooms: number | null;
  area: string | null;
  region: string | null;
  district: string | null;
  created_at: string;
  last_activity: string | null;
  verified: boolean;
  landlord_id: string | null;
  landlord_name: string | null;
  landlord_phone: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_phone: string | null;
}

export function useMissionEmptyHouses(win: CounterWindow, enabled: boolean, refetchIntervalMs?: number | false) {
  const since = windowToISO(win);
  return useQuery({
    enabled,
    queryKey: ['welile-mission-empty-houses', win],
    staleTime: 60_000,
    refetchInterval: refetchIntervalMs || false,
    queryFn: async (): Promise<MissionEmptyHouseRow[]> => {
      const { data, error } = await supabase.rpc('welile_mission_empty_houses' as any, { p_since: since });
      if (error) throw error;
      return (data ?? []) as MissionEmptyHouseRow[];
    },
  });
}

// ===== Placed tenants (occupied houses = landlords linked to a tenant) =====

export interface MissionPlacementRow {
  landlord_id: string;
  landlord_name: string | null;
  landlord_phone: string | null;
  property_address: string | null;
  monthly_rent: number | null;
  verified: boolean;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  created_at: string;
}

export function useMissionPlacements(win: CounterWindow, enabled: boolean, refetchIntervalMs?: number | false) {
  const since = windowToISO(win);
  return useQuery({
    enabled,
    queryKey: ['welile-mission-placements', win],
    staleTime: 60_000,
    refetchInterval: refetchIntervalMs || false,
    queryFn: async (): Promise<MissionPlacementRow[]> => {
      const { data, error } = await supabase.rpc('welile_mission_placements' as any, { p_since: since });
      if (error) throw error;
      return (data ?? []) as MissionPlacementRow[];
    },
  });
}

// ===== Funders (Partner Ops portfolios + promissory notes) =====

export interface MissionFunderRow {
  funder_key: string;
  source: 'portfolio' | 'promissory';
  name: string | null;
  phone: string | null;
  amount: number | null;
  status: string | null;
  activated: boolean;
  reference: string | null;
  agent_id: string | null;
  agent_name: string | null;
  investor_id: string | null;
  created_at: string;
}

export function useMissionFunders(win: CounterWindow, enabled: boolean, refetchIntervalMs?: number | false) {
  const since = windowToISO(win);
  return useQuery({
    enabled,
    queryKey: ['welile-mission-funders', win],
    staleTime: 60_000,
    refetchInterval: refetchIntervalMs || false,
    queryFn: async (): Promise<MissionFunderRow[]> => {
      const { data, error } = await supabase.rpc('welile_mission_funders' as any, { p_since: since });
      if (error) throw error;
      return (data ?? []) as MissionFunderRow[];
    },
  });
}

// ===== Landlord onboarding targeting =====

export interface LandlordOnboardingTarget {
  id: string;
  landlord_id: string;
  listing_id: string | null;
  status: string;
  note: string | null;
  created_at: string;
}

const TARGETS_KEY = ['landlord-onboarding-targets'];

export function useLandlordOnboardingTargets(enabled = true) {
  return useQuery({
    enabled,
    queryKey: TARGETS_KEY,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, LandlordOnboardingTarget>> => {
      const { data, error } = await supabase
        .from('landlord_onboarding_targets' as any)
        .select('id, landlord_id, listing_id, status, note, created_at');
      if (error) throw error;
      const map: Record<string, LandlordOnboardingTarget> = {};
      ((data ?? []) as any[]).forEach((r) => { map[r.landlord_id] = r as LandlordOnboardingTarget; });
      return map;
    },
  });
}

export function useTargetLandlordForOnboarding() {
  const qc = useQueryClient();
  return useCallback(async (landlordId: string, listingId?: string | null) => {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('landlord_onboarding_targets' as any)
      .upsert(
        { landlord_id: landlordId, listing_id: listingId ?? null, status: 'targeted', targeted_by: auth.user?.id ?? null },
        { onConflict: 'landlord_id' },
      );
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: TARGETS_KEY });
  }, [qc]);
}

export function useBulkTargetLandlordsForOnboarding() {
  const qc = useQueryClient();
  return useCallback(async (items: { landlordId: string; listingId?: string | null }[]) => {
    const { data: auth } = await supabase.auth.getUser();
    const rows = items.map((item) => ({
      landlord_id: item.landlordId,
      listing_id: item.listingId ?? null,
      status: 'targeted',
      targeted_by: auth.user?.id ?? null,
    }));
    const { error } = await supabase
      .from('landlord_onboarding_targets' as any)
      .upsert(rows, { onConflict: 'landlord_id' });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: TARGETS_KEY });
  }, [qc]);
}