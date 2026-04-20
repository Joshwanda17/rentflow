import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type LandlordFloatAllocation = {
  id: string;
  agent_id: string;
  tenant_id: string | null;
  rent_request_id: string | null;
  landlord_id: string | null;
  landlord_name: string;
  landlord_phone: string | null;
  mobile_money_provider: string | null;
  allocated_amount: number;
  paid_out_amount: number;
  remaining_amount: number;
  status: 'open' | 'partially_paid' | 'fully_paid' | 'cancelled';
  source: string;
  created_at: string;
};

/**
 * Fetches the agent's per-tenant landlord float allocations.
 * Each row represents one CFO disbursement targeted at a specific tenant→landlord pair.
 * Used by the agent payout flow to drill from "total float" → "tenant" → "withdraw".
 */
export function useLandlordFloatAllocations(opts?: { onlyOpen?: boolean }) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['landlord-float-allocations', user?.id, opts?.onlyOpen ?? true],
    queryFn: async (): Promise<LandlordFloatAllocation[]> => {
      if (!user) return [];
      let q = supabase
        .from('agent_landlord_float_allocations' as any)
        .select('*')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (opts?.onlyOpen !== false) {
        q = q.in('status', ['open', 'partially_paid']);
      }
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        allocated_amount: Number(r.allocated_amount) || 0,
        paid_out_amount: Number(r.paid_out_amount) || 0,
        remaining_amount: Number(r.remaining_amount) || 0,
      })) as LandlordFloatAllocation[];
    },
    enabled: !!user,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
