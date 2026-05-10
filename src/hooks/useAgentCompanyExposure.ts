import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAgentBalances } from '@/hooks/useAgentBalances';
import { useWalletRealtime } from '@/hooks/useWalletRealtime';

/**
 * "What I owe Welile" — total company exposure on an agent's book.
 *
 * Pure read-only aggregation over data the app already queries:
 *   - rent_requests where agent_id = me  (cycles funded by Welile)
 *   - subscription_charges where agent_id = me  (guarantor debt)
 *   - wallets.advance_balance via useAgentBalances  (personal advance)
 *
 * Headline = outstandingCycles + subscriptionDebt + advanceBalance.
 * Lifetime totals are shown as context so the number isn't scary in isolation.
 */
export interface AgentCompanyExposure {
  outstandingCycles: number;
  lifetimeDisbursed: number;
  lifetimeRepaid: number;
  subscriptionDebt: number;
  advanceBalance: number;
  totalOwed: number;
  activeCycleCount: number;
  tenantCount: number;
}

export function useAgentCompanyExposure() {
  const { user } = useAuth();
  const { advanceBalance } = useAgentBalances();
  useWalletRealtime(user?.id);

  const query = useQuery({
    queryKey: ['agent-company-exposure', user?.id],
    queryFn: async (): Promise<Omit<AgentCompanyExposure, 'advanceBalance' | 'totalOwed'>> => {
      if (!user?.id) {
        return {
          outstandingCycles: 0,
          lifetimeDisbursed: 0,
          lifetimeRepaid: 0,
          subscriptionDebt: 0,
          activeCycleCount: 0,
          tenantCount: 0,
        };
      }

      const ACTIVE = ['funded', 'disbursed', 'repaying'];
      const HISTORICAL = ['funded', 'disbursed', 'repaying', 'completed'];

      const [rentRes, chargesRes] = await Promise.all([
        supabase
          .from('rent_requests')
          .select('id, tenant_id, rent_amount, total_repayment, amount_repaid, status')
          .eq('agent_id', user.id)
          .in('status', HISTORICAL),
        supabase
          .from('subscription_charges')
          .select('accumulated_debt')
          .eq('agent_id', user.id)
          .eq('status', 'active'),
      ]);

      const rows = rentRes.data || [];
      let lifetimeDisbursed = 0;
      let lifetimeRepaid = 0;
      let outstandingCycles = 0;
      let activeCycleCount = 0;
      const tenants = new Set<string>();

      for (const r of rows) {
        const disbursed = Number(r.rent_amount || 0);
        const owed = Number(r.total_repayment || 0);
        const repaid = Number(r.amount_repaid || 0);
        lifetimeDisbursed += disbursed;
        lifetimeRepaid += repaid;
        if (r.tenant_id) tenants.add(r.tenant_id);
        if (ACTIVE.includes(r.status as string)) {
          activeCycleCount += 1;
          outstandingCycles += Math.max(0, owed - repaid);
        }
      }

      const subscriptionDebt = (chargesRes.data || []).reduce(
        (s, c: any) => s + Number(c.accumulated_debt || 0),
        0,
      );

      return {
        outstandingCycles,
        lifetimeDisbursed,
        lifetimeRepaid,
        subscriptionDebt,
        activeCycleCount,
        tenantCount: tenants.size,
      };
    },
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const data = query.data;
  const totalOwed =
    (data?.outstandingCycles ?? 0) + (data?.subscriptionDebt ?? 0) + (advanceBalance ?? 0);

  return {
    ...(data ?? {
      outstandingCycles: 0,
      lifetimeDisbursed: 0,
      lifetimeRepaid: 0,
      subscriptionDebt: 0,
      activeCycleCount: 0,
      tenantCount: 0,
    }),
    advanceBalance,
    totalOwed,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  } as AgentCompanyExposure & {
    isLoading: boolean;
    error: unknown;
    refetch: () => void;
  };
}
