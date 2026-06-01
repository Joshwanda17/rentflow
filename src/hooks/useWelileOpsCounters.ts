import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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