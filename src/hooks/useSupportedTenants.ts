import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface SupportedTenant {
  rent_request_id: string;
  tenant_id: string | null;
  tenant_name: string;
  tenant_avatar_url: string | null;
  tenant_phone: string | null;
  tenant_address: string | null;
  city: string | null;
  house_category: string | null;
  rent_amount: number;
  duration_days: number | null;
  status: string;
  funded_at: string | null;
  created_at: string | null;
  funding_mode: 'self_managed' | 'managed';
}

export function useSupportedTenants() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['funder-supported-tenants', user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('funder_supported_tenants' as any);
      if (error) throw error;
      return ((data as any[]) || []) as SupportedTenant[];
    },
  });

  return {
    tenants: query.data || [],
    count: query.data?.length ?? 0,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
