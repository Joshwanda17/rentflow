import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Tenant Ops call tracking (append-only).
 *
 * `tenant_call_reports` rows are never updated or deleted — each call attempt is
 * a new row. `v_tenant_call_summary` gives the per-tenant rollup used by the
 * Missed Days / Calls Made lists and the tenant reports.
 */

export type TenantCallOutcome = 'picked_up' | 'missed';

export interface TenantCallSummary {
  tenant_id: string;
  call_count: number;
  picked_up_count: number;
  missed_count: number;
  last_call_at: string | null;
  last_picked_up_at: string | null;
  last_outcome: TenantCallOutcome | null;
  latest_comment: string | null;
  latest_comment_at: string | null;
}

export interface TenantCallRecord {
  id: string;
  tenant_id: string;
  rent_request_id: string | null;
  outcome: TenantCallOutcome;
  comment: string | null;
  called_by: string;
  called_at: string;
}

/** All-time call rollup for every tenant that has ever been called. */
export function useTenantCallSummaries() {
  return useQuery({
    queryKey: ['tenant-call-summaries'],
    queryFn: async () => {
      const all: TenantCallSummary[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await (supabase as any)
          .from('v_tenant_call_summary')
          .select('*')
          .range(from, from + page - 1);
        if (error) throw error;
        all.push(...((data || []) as TenantCallSummary[]));
        if (!data || data.length < page) break;
      }
      const map = new Map<string, TenantCallSummary>();
      all.forEach(r => map.set(r.tenant_id, r));
      return map;
    },
    staleTime: 60000,
  });
}

/** Full, untruncated call history for one tenant (newest first). */
export function useTenantCallHistory(tenantId?: string | null) {
  return useQuery({
    queryKey: ['tenant-call-history', tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('tenant_call_reports')
        .select('id, tenant_id, rent_request_id, outcome, comment, called_by, called_at')
        .eq('tenant_id', tenantId)
        .order('called_at', { ascending: false });
      if (error) throw error;
      return (data || []) as TenantCallRecord[];
    },
    enabled: !!tenantId,
    staleTime: 30000,
  });
}

export function useLogTenantCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenantId: string;
      outcome: TenantCallOutcome;
      comment?: string | null;
      rentRequestId?: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error('You must be signed in to log a call.');
      const { error } = await (supabase as any).from('tenant_call_reports').insert({
        tenant_id: input.tenantId,
        rent_request_id: input.rentRequestId || null,
        outcome: input.outcome,
        comment: input.comment?.trim() ? input.comment.trim() : null,
        called_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tenant-call-summaries'] });
      qc.invalidateQueries({ queryKey: ['tenant-call-history', vars.tenantId] });
      toast.success(vars.outcome === 'picked_up' ? 'Call logged — tenant reached' : 'Call logged — tenant not reached');
    },
    onError: (e: any) => toast.error(e?.message || 'Could not log the call'),
  });
}
