import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LandlordOpsTotals {
  total: number;
  verified: number;
  pending: number;
  has_tenants: number;
  no_tenants: number;
  smartphone: number;
  occupied_monthly_revenue: number;
  empty_monthly_revenue: number;
}

export interface LandlordOpsRow {
  id: string;
  name: string;
  phone: string;
  verified: boolean;
  has_smartphone: boolean | null;
  mobile_money_name: string | null;
  mobile_money_number: string | null;
  number_of_houses: number | null;
  bank_name: string | null;
  account_number: string | null;
  monthly_rent: number | null;
  caretaker_name: string | null;
  caretaker_phone: string | null;
  tin: string | null;
  electricity_meter_number: string | null;
  water_meter_number: string | null;
  village: string | null;
  district: string | null;
  region: string | null;
  property_address: string | null;
  tenant_id: string | null;
  registered_by: string | null;
  managed_by_agent_id: string | null;
  house_category: string | null;
  number_of_rooms: number | null;
  created_at: string;
  tenant_count: number;
  agent_name: string | null;
  agent_phone: string | null;
  tenant_name: string | null;
  tenant_phone_profile: string | null;
}

export type LandlordCategory = 'all' | 'verified' | 'pending' | 'has_tenants' | 'no_tenants';
export type LandlordPendingFilter = 'all' | 'has_address' | 'has_phone' | 'has_smartphone' | 'has_bank' | 'has_momo';
export type LandlordSort = 'newest' | 'oldest' | 'highest_rent';

async function invokeLandlordOps<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('landlord-ops', { body });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export function useLandlordOpsTotals(enabled = true) {
  return useQuery({
    queryKey: ['landlord-ops', 'totals'],
    queryFn: () => invokeLandlordOps<{ totals: LandlordOpsTotals }>({ action: 'totals' }),
    staleTime: 60_000,
    enabled,
  });
}

export interface UseLandlordOpsListParams {
  search: string;
  sort: LandlordSort;
  category: LandlordCategory;
  pendingFilter: LandlordPendingFilter;
  page: number;
  perPage: number;
  enabled?: boolean;
}

export function useLandlordOpsList(params: UseLandlordOpsListParams) {
  const { search, sort, category, pendingFilter, page, perPage, enabled = true } = params;
  const offset = Math.max(0, (page - 1) * perPage);
  return useQuery({
    queryKey: ['landlord-ops', 'rows', { search, sort, category, pendingFilter, page, perPage }],
    queryFn: () =>
      invokeLandlordOps<{
        rows: LandlordOpsRow[];
        totals: LandlordOpsTotals;
        totalMatched: number;
        limit: number;
        offset: number;
      }>({
        action: 'rows',
        search,
        sort,
        category,
        pending_filter: pendingFilter,
        limit: perPage,
        offset,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  });
}