import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TenantLocationLevel = 'country' | 'region' | 'district' | 'ward' | 'agent' | 'landlord';

export interface TenantBreadcrumbPath {
  country?: string;
  region?: string;
  district?: string;
  ward?: string;
  agentId?: string | null;
  agentName?: string;
  landlordId?: string | null;
  landlordName?: string;
}

export interface TenantBreakdownRow {
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

export function tenantNextLevel(p: TenantBreadcrumbPath): TenantLocationLevel | 'tenants' {
  if (!p.country) return 'country';
  if (!p.region) return 'region';
  if (!p.district) return 'district';
  if (!p.ward) return 'ward';
  if (p.agentId === undefined) return 'agent';
  if (p.landlordId === undefined) return 'landlord';
  return 'tenants';
}

export function useTenantLocationBreakdown(path: TenantBreadcrumbPath) {
  const level = tenantNextLevel(path);
  return useQuery({
    enabled: level !== 'tenants',
    queryKey: ['tenant-location-breakdown', level, path.country, path.region, path.district, path.ward, path.agentId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_tenant_location_breakdown' as any, {
        p_level: level,
        p_country: path.country ?? null,
        p_region: path.region ?? null,
        p_district: path.district ?? null,
        p_ward: path.ward ?? null,
        p_agent_id: path.agentId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as TenantBreakdownRow[];
    },
  });
}

export interface TenantLeaf {
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string | null;
  tenant_avatar_url: string | null;
  tenant_photo_url: string | null;
  house_image_urls: string[] | null;
  house_category: string | null;
  rent_amount: number | null;
  rent_request_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  landlord_id: string | null;
  landlord_name: string | null;
  country: string;
  region: string;
  district: string;
  ward: string;
}

export function useTenantsAtLeaf(path: TenantBreadcrumbPath) {
  const enabled = tenantNextLevel(path) === 'tenants';
  return useQuery({
    enabled,
    queryKey: ['tenants-at-leaf', path.country, path.region, path.district, path.ward, path.agentId, path.landlordId],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_tenants_at_leaf' as any, {
        p_country: path.country!,
        p_region: path.region!,
        p_district: path.district!,
        p_ward: path.ward!,
        p_agent_id: path.agentId ?? null,
        p_landlord_id: path.landlordId ?? null,
        p_limit: 300,
      });
      if (error) throw error;
      return (data ?? []) as TenantLeaf[];
    },
  });
}