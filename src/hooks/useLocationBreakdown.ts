import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type LocationLevel = 'country' | 'region' | 'district' | 'ward' | 'agent' | 'landlord';

export interface BreadcrumbPath {
  country?: string;
  region?: string;
  district?: string;
  ward?: string;
  agentId?: string;
  agentName?: string;
  landlordId?: string;
  landlordName?: string;
}

export interface BreakdownRow {
  key: string;
  label: string;
  agent_id: string | null;
  landlord_id: string | null;
  agent_name: string | null;
  landlord_name: string | null;
  total: number;
  occupied: number;
  vacant: number;
  hidden: number;
  revenue_ugx: number;
}

export function nextLevel(path: BreadcrumbPath): LocationLevel | 'properties' {
  if (!path.country) return 'country';
  if (!path.region) return 'region';
  if (!path.district) return 'district';
  if (!path.ward) return 'ward';
  if (!path.agentId) return 'agent';
  if (!path.landlordId) return 'landlord';
  return 'properties';
}

export function useLocationBreakdown(path: BreadcrumbPath) {
  const level = nextLevel(path);
  return useQuery({
    enabled: level !== 'properties',
    queryKey: ['location-breakdown', level, path.country, path.region, path.district, path.ward, path.agentId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_location_breakdown' as any, {
        p_level: level,
        p_country: path.country ?? null,
        p_region: path.region ?? null,
        p_district: path.district ?? null,
        p_ward: path.ward ?? null,
        p_agent_id: path.agentId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as BreakdownRow[];
    },
  });
}

export interface PropertyLeaf {
  id: string;
  title: string;
  address: string;
  monthly_rent: number;
  daily_rate: number;
  status: string;
  tenant_id: string | null;
  is_hidden: boolean;
  created_at: string;
}

export function usePropertiesAtLeaf(path: BreadcrumbPath) {
  const enabled = nextLevel(path) === 'properties';
  return useQuery({
    enabled,
    queryKey: ['location-properties', path.country, path.region, path.district, path.ward, path.agentId, path.landlordId],
    staleTime: 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from('house_listings')
        .select('id,title,address,monthly_rent,daily_rate,status,tenant_id,is_hidden,created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (path.region && !path.region.startsWith('—')) q = q.eq('region', path.region);
      if (path.district && !path.district.startsWith('—')) q = q.eq('district', path.district);
      if (path.ward && !path.ward.startsWith('—')) q = q.eq('sub_county', path.ward);
      if (path.agentId) q = q.eq('agent_id', path.agentId);
      if (path.landlordId) q = q.eq('landlord_id', path.landlordId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PropertyLeaf[];
    },
  });
}