import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const STALE_TIME = 300_000; // 5 minutes

export function useCFOOverviewData() {
  // Channel balances from deposit_requests (approved) grouped by provider
  const channelBalances = useQuery({
    queryKey: ['cfo-overview-channels'],
    queryFn: async () => {
      const { data: deposits } = await supabase
        .from('deposit_requests')
        .select('amount, provider')
        .eq('status', 'approved');

      const { data: withdrawals } = await supabase
        .from('withdrawal_requests')
        .select('amount, mobile_money_provider')
        .eq('status', 'approved');

      const { data: withdrawals } = await supabase
        .from('withdrawal_requests')
        .select('amount, mobile_money_provider')
        .eq('status', 'approved');

      const channels: Record<string, { deposits: number; withdrawals: number }> = {
        MTN: { deposits: 0, withdrawals: 0 },
        Airtel: { deposits: 0, withdrawals: 0 },
        Bank: { deposits: 0, withdrawals: 0 },
        Cash: { deposits: 0, withdrawals: 0 },
      };

      (deposits || []).forEach((d) => {
        const provider = mapProvider(d.provider);
        channels[provider].deposits += Number(d.amount);
      });

      (withdrawals || []).forEach((w) => {
        const provider = mapProvider(w.mobile_money_provider);
        channels[provider].withdrawals += Number(w.amount);
      });

      const totalCash = Object.values(channels).reduce(
        (sum, c) => sum + (c.deposits - c.withdrawals),
        0
      );

      return { channels, totalCash };
    },
    staleTime: STALE_TIME,
  });

  // Wallet totals grouped by role for liability breakdown
  const liabilities = useQuery({
    queryKey: ['cfo-overview-liabilities'],
    queryFn: async () => {
      const { data: wallets } = await supabase
        .from('wallets')
        .select('balance, user_id');

      const totalWalletBalance = (wallets || []).reduce(
        (sum, w) => sum + Number(w.balance),
        0
      );

      // Pending withdrawals
      const { data: pendingWithdrawals } = await supabase
        .from('withdrawal_requests')
        .select('amount')
        .eq('status', 'pending');

      const pendingWithdrawalTotal = (pendingWithdrawals || []).reduce(
        (sum, w) => sum + Number(w.amount),
        0
      );

      // ROI obligations from investor portfolios
      const { data: portfolios } = await supabase
        .from('investor_portfolios')
        .select('expected_return, actual_return')
        .eq('status', 'active');

      const roiObligations = (portfolios || []).reduce(
        (sum, p) => sum + (Number(p.expected_return) - Number(p.actual_return || 0)),
        0
      );

      // Agent commission payouts pending
      const { data: agentPayouts } = await supabase
        .from('agent_commission_payouts')
        .select('amount')
        .eq('status', 'pending');

      const agentPayables = (agentPayouts || []).reduce(
        (sum, p) => sum + Number(p.amount),
        0
      );

      const totalLiabilities = totalWalletBalance + pendingWithdrawalTotal + roiObligations + agentPayables;

      return {
        tenantFunds: totalWalletBalance,
        agentPayables,
        landlordPayables: 0, // derived from rent pipeline if needed
        roiObligations,
        pendingWithdrawals: pendingWithdrawalTotal,
        totalLiabilities,
      };
    },
    staleTime: STALE_TIME,
  });

  // Platform revenue from general_ledger (platform scope)
  const revenue = useQuery({
    queryKey: ['cfo-overview-revenue'],
    queryFn: async () => {
      const { data: entries } = await supabase
        .from('general_ledger')
        .select('amount, direction, category, created_at')
        .eq('scope', 'platform');

      let totalRevenue = 0;
      let totalCosts = 0;

      (entries || []).forEach((e) => {
        if (e.category === 'opening_balance') return;
        const amt = Number(e.amount);
        if (e.direction === 'cash_in') totalRevenue += amt;
        else totalCosts += amt;
      });

      // 7-day trend
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
      const dailyRevenue: { date: string; amount: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const dayTotal = (entries || [])
          .filter(
            (e) =>
              e.direction === 'cash_in' &&
              e.category !== 'opening_balance' &&
              e.created_at.startsWith(dateStr)
          )
          .reduce((s, e) => s + Number(e.amount), 0);
        dailyRevenue.push({ date: dateStr, amount: dayTotal });
      }

      return {
        totalRevenue,
        totalCosts,
        netProfit: totalRevenue - totalCosts,
        trend: dailyRevenue,
      };
    },
    staleTime: STALE_TIME,
  });

  // Money flow: 30-day deposit/withdrawal trend
  const moneyFlow = useQuery({
    queryKey: ['cfo-overview-flow'],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

      const { data: deposits } = await supabase
        .from('deposit_requests')
        .select('amount, created_at')
        .eq('status', 'approved')
        .gte('created_at', thirtyDaysAgo);

      const { data: withdrawals } = await supabase
        .from('withdrawal_requests')
        .select('amount, created_at')
        .eq('status', 'approved')
        .gte('created_at', thirtyDaysAgo);

      let totalInflows = 0;
      let totalOutflows = 0;
      const dailyMap: Record<string, { inflow: number; outflow: number }> = {};

      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        dailyMap[d.toISOString().split('T')[0]] = { inflow: 0, outflow: 0 };
      }

      (deposits || []).forEach((d) => {
        const amt = Number(d.amount);
        totalInflows += amt;
        const dateStr = d.created_at.split('T')[0];
        if (dailyMap[dateStr]) dailyMap[dateStr].inflow += amt;
      });

      (withdrawals || []).forEach((w) => {
        const amt = Number(w.amount);
        totalOutflows += amt;
        const dateStr = w.created_at.split('T')[0];
        if (dailyMap[dateStr]) dailyMap[dateStr].outflow += amt;
      });

      const trend = Object.entries(dailyMap).map(([date, vals]) => ({
        date,
        inflow: vals.inflow,
        outflow: vals.outflow,
      }));

      return { totalInflows, totalOutflows, netFlow: totalInflows - totalOutflows, trend };
    },
    staleTime: STALE_TIME,
  });

  const isLoading =
    channelBalances.isLoading || liabilities.isLoading || revenue.isLoading || moneyFlow.isLoading;

  return {
    channelBalances: channelBalances.data,
    liabilities: liabilities.data,
    revenue: revenue.data,
    moneyFlow: moneyFlow.data,
    isLoading,
  };
}

function mapProvider(provider: string | null): string {
  if (!provider) return 'Cash';
  const p = provider.toLowerCase();
  if (p.includes('mtn')) return 'MTN';
  if (p.includes('airtel')) return 'Airtel';
  if (p.includes('bank') || p.includes('stanbic') || p.includes('centenary')) return 'Bank';
  return 'Cash';
}
