import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TpsMetrics {
  new_tenants: number;
  total_tenants: number;
  applications: number;
  accepted: number;
  rejected: number;
  active_tenants: number;
  collected: number;
  payments: number;
  payables: number;
  payable_tenants: number;
}

export interface TpsSeriesPoint {
  day: string;
  new_tenants: number;
  applications: number;
  accepted: number;
  rejected: number;
  paid_tenants: number;
  collected: number;
  payables: number;
}

export interface TpsReport {
  period: {
    from: string; to: string; days: number; timezone: string;
    start_at: string; end_at: string;
    previous_from: string; previous_to: string;
  };
  current: TpsMetrics;
  previous: TpsMetrics;
  outstanding_payables: number;
  outstanding_payables_count: number;
  tenant_register_total: number;
  series: TpsSeriesPoint[];
  application_status: { status: string; n: number }[];
  districts: { district: string; paying_tenants: number; collected: number }[];
  generated_at: string;
}

export interface TpsRow {
  tenant_id: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  district: string | null;
  region: string | null;
  agent_id: string | null;
  agent_name: string | null;
  tenant_created_at: string | null;
  is_new_in_period: boolean;
  application_status: string | null;
  applied_in_period: boolean;
  accepted_in_period: boolean;
  rejected_in_period: boolean;
  paid_in_period: number;
  payments_in_period: number;
  last_payment_at: string | null;
  rent_amount: number;
  daily_repayment: number;
  outstanding: number;
  payables_in_period: number;
  total_count: number;
}

/** Server-side aggregated headline report for a date range (EAT days). */
export function useTenantProductsReport(from: string, to: string) {
  return useQuery({
    queryKey: ['tenant-products-report', from, to],
    queryFn: async (): Promise<TpsReport> => {
      const { data, error } = await supabase.rpc('ops_tenant_products_services_report' as any, {
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return data as unknown as TpsReport;
    },
    staleTime: 60_000,
  });
}

export interface TpsRowFilters {
  search?: string;
  district?: string;
  agentId?: string | null;
  status?: string;
  payment?: string;
  page: number;
  pageSize: number;
}

/** Paginated tenant rows behind the report (filters applied server-side). */
export function useTenantProductsRows(from: string, to: string, f: TpsRowFilters) {
  return useQuery({
    queryKey: ['tenant-products-rows', from, to, f.search, f.district, f.agentId, f.status, f.payment, f.page, f.pageSize],
    queryFn: async (): Promise<{ rows: TpsRow[]; total: number }> => {
      const { data, error } = await supabase.rpc('ops_tenant_products_services_rows' as any, {
        p_from: from,
        p_to: to,
        p_search: f.search?.trim() || null,
        p_district: f.district && f.district !== 'all' ? f.district : null,
        p_agent: f.agentId || null,
        p_status: f.status || 'all',
        p_payment: f.payment || 'all',
        p_limit: f.pageSize,
        p_offset: (f.page - 1) * f.pageSize,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as TpsRow[];
      return { rows, total: rows.length ? Number(rows[0].total_count ?? 0) : 0 };
    },
    staleTime: 30_000,
  });
}

/** Full row set for exports — paged through the same RPC without UI caps. */
export async function fetchAllTenantProductsRows(from: string, to: string, f: Omit<TpsRowFilters, 'page' | 'pageSize'>) {
  const PAGE = 2000;
  const all: TpsRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.rpc('ops_tenant_products_services_rows' as any, {
      p_from: from,
      p_to: to,
      p_search: f.search?.trim() || null,
      p_district: f.district && f.district !== 'all' ? f.district : null,
      p_agent: f.agentId || null,
      p_status: f.status || 'all',
      p_payment: f.payment || 'all',
      p_limit: PAGE,
      p_offset: offset,
    });
    if (error) throw error;
    const rows = (data ?? []) as unknown as TpsRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
    if (offset > 100_000) break;
  }
  return all;
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}
