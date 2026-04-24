import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ImpactMetric = 'users' | 'tenants' | 'agents' | 'partners' | 'landlords_active' | 'landlords_dormant';

export interface DrilldownRecord {
  id: string;
  name: string;
  phone: string | null;
  amount?: number;
  date: string;
  meta?: string;
}

export interface DrilldownResult {
  records: DrilldownRecord[];
  total: number;
  truncated: boolean;
}

const PAGE_SIZE = 200;

/**
 * Loads underlying records behind each CFO Impact KPI, optionally
 * scoped to a date range. All queries are read-only and capped at 200 rows.
 */
export function useCFOImpactDrilldown(
  metric: ImpactMetric | null,
  from: Date | undefined,
  to: Date | undefined,
  enabled: boolean,
) {
  return useQuery<DrilldownResult>({
    queryKey: ['cfo-impact-drilldown', metric, from?.toISOString() ?? null, to?.toISOString() ?? null],
    enabled: enabled && !!metric,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!metric) return { records: [], total: 0, truncated: false };
      const fromIso = from ? from.toISOString() : null;
      const toIso = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString() : null;

      if (metric === 'users') {
        let q = supabase
          .from('profiles')
          .select('id, full_name, phone, created_at', { count: 'exact' })
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
        if (fromIso) q = q.gte('created_at', fromIso);
        if (toIso) q = q.lte('created_at', toIso);
        const { data, count, error } = await q;
        if (error) throw error;
        return {
          records: (data || []).map((r: any) => ({
            id: r.id,
            name: r.full_name || 'Unnamed',
            phone: r.phone,
            date: r.created_at,
          })),
          total: count ?? data?.length ?? 0,
          truncated: (count ?? 0) > PAGE_SIZE,
        };
      }

      if (metric === 'tenants') {
        let q = supabase
          .from('rent_requests')
          .select('tenant_id, amount, status, created_at', { count: 'exact' })
          .in('status', ['disbursed', 'repaying', 'completed', 'funded'])
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
        if (fromIso) q = q.gte('created_at', fromIso);
        if (toIso) q = q.lte('created_at', toIso);
        const { data, count, error } = await q;
        if (error) throw error;
        const rows = data || [];
        const tenantIds = [...new Set(rows.map((r: any) => r.tenant_id).filter(Boolean))] as string[];
        const { data: profiles } = tenantIds.length
          ? await supabase.from('profiles').select('id, full_name, phone').in('id', tenantIds)
          : { data: [] as any[] };
        const map = new Map((profiles || []).map((p: any) => [p.id, p]));
        // Dedupe per tenant — keep most recent
        const seen = new Set<string>();
        const records: DrilldownRecord[] = [];
        for (const r of rows as any[]) {
          if (seen.has(r.tenant_id)) continue;
          seen.add(r.tenant_id);
          const p = map.get(r.tenant_id);
          records.push({
            id: r.tenant_id,
            name: p?.full_name || 'Unnamed',
            phone: p?.phone || null,
            amount: Number(r.amount || 0),
            date: r.created_at,
            meta: r.status,
          });
        }
        return { records, total: records.length, truncated: (count ?? 0) > PAGE_SIZE };
      }

      if (metric === 'agents') {
        let q = supabase
          .from('agent_earnings')
          .select('agent_id, amount, created_at', { count: 'exact' })
          .gt('amount', 0)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
        if (fromIso) q = q.gte('created_at', fromIso);
        if (toIso) q = q.lte('created_at', toIso);
        const { data, count, error } = await q;
        if (error) throw error;
        const rows = data || [];
        // Aggregate per agent
        const agg = new Map<string, { total: number; last: string }>();
        for (const r of rows as any[]) {
          const cur = agg.get(r.agent_id) || { total: 0, last: r.created_at };
          cur.total += Number(r.amount || 0);
          if (r.created_at > cur.last) cur.last = r.created_at;
          agg.set(r.agent_id, cur);
        }
        const agentIds = [...agg.keys()];
        const { data: profiles } = agentIds.length
          ? await supabase.from('profiles').select('id, full_name, phone').in('id', agentIds)
          : { data: [] as any[] };
        const map = new Map((profiles || []).map((p: any) => [p.id, p]));
        const records: DrilldownRecord[] = agentIds
          .map((id) => {
            const p = map.get(id);
            const a = agg.get(id)!;
            return {
              id,
              name: p?.full_name || 'Unnamed',
              phone: p?.phone || null,
              amount: a.total,
              date: a.last,
              meta: 'earned',
            };
          })
          .sort((a, b) => (b.amount || 0) - (a.amount || 0));
        return { records, total: records.length, truncated: (count ?? 0) > PAGE_SIZE };
      }

      // partners
      if (metric === 'partners') {
        let q = supabase
        .from('investor_portfolios')
        .select('investor_id, investment_amount, status, created_at, portfolio_code', { count: 'exact' })
        .eq('status', 'active')
        .gt('investment_amount', 0)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
        if (fromIso) q = q.gte('created_at', fromIso);
        if (toIso) q = q.lte('created_at', toIso);
        const { data, count, error } = await q;
        if (error) throw error;
        const rows = data || [];
      // Aggregate per investor
      const agg = new Map<string, { total: number; last: string; codes: number }>();
      for (const r of rows as any[]) {
        const cur = agg.get(r.investor_id) || { total: 0, last: r.created_at, codes: 0 };
        cur.total += Number(r.investment_amount || 0);
        cur.codes += 1;
        if (r.created_at > cur.last) cur.last = r.created_at;
        agg.set(r.investor_id, cur);
      }
      const ids = [...agg.keys()];
      const { data: profiles } = ids.length
        ? await supabase.from('profiles').select('id, full_name, phone').in('id', ids)
        : { data: [] as any[] };
      const map = new Map((profiles || []).map((p: any) => [p.id, p]));
      const records: DrilldownRecord[] = ids
        .map((id) => {
          const p = map.get(id);
          const a = agg.get(id)!;
          return {
            id,
            name: p?.full_name || 'Unnamed',
            phone: p?.phone || null,
            amount: a.total,
            date: a.last,
            meta: `${a.codes} portfolio${a.codes > 1 ? 's' : ''}`,
          };
        })
        .sort((a, b) => (b.amount || 0) - (a.amount || 0));
        return { records, total: records.length, truncated: (count ?? 0) > PAGE_SIZE };
      }

      // landlords_active / landlords_dormant
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      let lq = supabase
        .from('landlords')
        .select('id, name, phone, monthly_rent, rent_last_paid_at, rent_last_paid_amount, rent_balance_due, created_at, property_address', { count: 'exact' })
        .limit(PAGE_SIZE);

      if (metric === 'landlords_active') {
        lq = lq.gte('rent_last_paid_at', ninetyDaysAgo).order('rent_last_paid_at', { ascending: false });
      } else {
        // dormant: never paid OR last paid before 90d ago
        lq = lq.or(`rent_last_paid_at.is.null,rent_last_paid_at.lt.${ninetyDaysAgo}`).order('created_at', { ascending: false });
      }

      // Date range applies to landlord registration (created_at)
      if (fromIso) lq = lq.gte('created_at', fromIso);
      if (toIso) lq = lq.lte('created_at', toIso);

      const { data: lData, count: lCount, error: lErr } = await lq;
      if (lErr) throw lErr;
      const lRecords: DrilldownRecord[] = (lData || []).map((r: any) => ({
        id: r.id,
        name: r.name || 'Unnamed',
        phone: r.phone || null,
        amount: metric === 'landlords_active'
          ? Number(r.rent_last_paid_amount || 0)
          : Number(r.rent_balance_due || 0),
        date: metric === 'landlords_active' ? (r.rent_last_paid_at || r.created_at) : r.created_at,
        meta: metric === 'landlords_active'
          ? (r.property_address ? `📍 ${r.property_address.slice(0, 40)}` : 'last paid')
          : (r.rent_last_paid_at ? `last paid ${new Date(r.rent_last_paid_at).toLocaleDateString()}` : 'never paid'),
      }));
      return { records: lRecords, total: lCount ?? lRecords.length, truncated: (lCount ?? 0) > PAGE_SIZE };
    },
  });
}