import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LEDGER_SCOPE, FINAL_WITHDRAWAL_STATUSES } from '@/lib/ledgerConstants';

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
        .in('status', FINAL_WITHDRAWAL_STATUSES);

      const channels: Record<string, { deposits: number; withdrawals: number }> = {
        MTN: { deposits: 0, withdrawals: 0 },
        Airtel: { deposits: 0, withdrawals: 0 },
        Bank: { deposits: 0, withdrawals: 0 },
        Cash: { deposits: 0, withdrawals: 0 },
        Unassigned: { deposits: 0, withdrawals: 0 },
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

  // Receivables: tenant outstanding + advances outstanding
  const receivables = useQuery({
    queryKey: ['cfo-overview-receivables'],
    queryFn: async () => {
      const { data: charges } = await supabase
        .from('subscription_charges')
        .select('accumulated_debt')
        .eq('status', 'active');

      const tenantOutstanding = (charges || []).reduce(
        (sum, c) => sum + Number(c.accumulated_debt || 0),
        0
      );

      const { data: advances } = await supabase
        .from('agent_advances')
        .select('outstanding_balance')
        .eq('status', 'active');

      const advancesOutstanding = (advances || []).reduce(
        (sum, a) => sum + Number(a.outstanding_balance || 0),
        0
      );

      return {
        tenantOutstanding,
        advancesOutstanding,
        totalReceivables: tenantOutstanding + advancesOutstanding,
      };
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

      const { data: pendingWithdrawals } = await supabase
        .from('withdrawal_requests')
        .select('amount')
        .eq('status', 'pending');

      const pendingWithdrawalTotal = (pendingWithdrawals || []).reduce(
        (sum, w) => sum + Number(w.amount),
        0
      );

      const { data: portfolios } = await supabase
        .from('investor_portfolios')
        .select('investment_amount, roi_percentage, total_roi_earned')
        .eq('status', 'active');

      const roiObligations = (portfolios || []).reduce(
        (sum, p) => {
          const expectedReturn = Number(p.investment_amount) * (Number(p.roi_percentage) / 100);
          return sum + (expectedReturn - Number(p.total_roi_earned || 0));
        },
        0
      );

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
        landlordPayables: 0,
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
        .eq('ledger_scope', LEDGER_SCOPE.PLATFORM)
        .in('classification', ['production', 'legacy_real']);

      let totalRevenue = 0;
      let totalExpenses = 0;

      ((entries as any[]) || []).forEach((e) => {
        if (e.category === 'opening_balance') return;
        const amt = Number(e.amount);
        if (e.direction === 'cash_in') totalRevenue += amt;
        else totalExpenses += amt;
      });

      // 7-day trend
      const now = new Date();
      const dailyRevenue: { date: string; amount: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const dateStr = d.toISOString().split('T')[0];
        const dayTotal = ((entries as any[]) || [])
          .filter(
            (e) =>
              e.direction === 'cash_in' &&
              e.category !== 'opening_balance' &&
              e.created_at.startsWith(dateStr)
          )
          .reduce((s: number, e: any) => s + Number(e.amount), 0);
        dailyRevenue.push({ date: dateStr, amount: dayTotal });
      }

      return {
        totalRevenue,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
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
        .in('status', FINAL_WITHDRAWAL_STATUSES)
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

  // Cash Flow by Purpose from general_ledger
  const cashFlowByPurpose = useQuery({
    queryKey: ['cfo-overview-cashflow-purpose'],
    queryFn: async () => {
      const { data: entries } = await supabase
        .from('general_ledger')
        .select('amount, direction, category, created_at')
        .eq('ledger_scope', LEDGER_SCOPE.PLATFORM)
        .in('classification', ['production', 'legacy_real']);

      const cashIn = { partnerFunding: 0, tenantRepayments: 0, other: 0 };
      const cashOut = { rentPayments: 0, roiPayouts: 0, advances: 0, other: 0 };

      ((entries as any[]) || []).forEach((e) => {
        if (e.category === 'opening_balance') return;
        const amt = Number(e.amount);
        if (e.direction === 'cash_in') {
          if (e.category.includes('partner') || e.category.includes('investor') || e.category.includes('supporter')) {
            cashIn.partnerFunding += amt;
          } else if (e.category.includes('repayment') || e.category.includes('tenant')) {
            cashIn.tenantRepayments += amt;
          } else {
            cashIn.other += amt;
          }
        } else {
          if (e.category.includes('rent') || e.category.includes('landlord')) {
            cashOut.rentPayments += amt;
          } else if (e.category.includes('roi') || e.category.includes('payout')) {
            cashOut.roiPayouts += amt;
          } else if (e.category.includes('advance')) {
            cashOut.advances += amt;
          } else {
            cashOut.other += amt;
          }
        }
      });

      const totalIn = cashIn.partnerFunding + cashIn.tenantRepayments + cashIn.other;
      const totalOut = cashOut.rentPayments + cashOut.roiPayouts + cashOut.advances + cashOut.other;

      return {
        cashIn,
        cashOut,
        totalIn,
        totalOut,
        netMovement: totalIn - totalOut,
      };
    },
    staleTime: STALE_TIME,
  });

  // TODAY's cash flow from general_ledger
  const todayCashFlow = useQuery({
    queryKey: ['cfo-overview-today'],
    queryFn: async () => {
      const todayStr = new Date().toISOString().split('T')[0];

      const { data: entries } = await supabase
        .from('general_ledger')
        .select('amount, direction, category')
        .gte('created_at', `${todayStr}T00:00:00`)
        .lt('created_at', `${todayStr}T23:59:59.999`)
        .in('classification', ['production', 'legacy_real']);

      let cashInToday = 0;
      let cashOutToday = 0;
      const inflowCategories: Record<string, number> = {};
      const outflowCategories: Record<string, number> = {};

      ((entries as any[]) || []).forEach((e) => {
        const amt = Number(e.amount);
        const cat = (e.category as string) || 'uncategorized';
        if (e.direction === 'cash_in') {
          cashInToday += amt;
          inflowCategories[cat] = (inflowCategories[cat] || 0) + amt;
        } else if (e.direction === 'cash_out') {
          cashOutToday += amt;
          outflowCategories[cat] = (outflowCategories[cat] || 0) + amt;
        }
      });

      return {
        cashInToday,
        cashOutToday,
        netToday: cashInToday - cashOutToday,
        inflowCategories,
        outflowCategories,
      };
    },
    staleTime: 60_000, // 1 minute for today's data
  });

  // Ledger integrity diagnostics
  const integrityChecks = useQuery({
    queryKey: ['cfo-overview-integrity'],
    queryFn: async () => {
      // 1. Wallet vs Ledger drift: compare wallets.balance vs ledger net per user
      const { data: wallets } = await supabase
        .from('wallets')
        .select('user_id, balance');

      const { data: ledgerEntries } = await supabase
        .from('general_ledger')
        .select('user_id, amount, direction')
        .eq('ledger_scope', 'wallet')
        .in('classification', ['production', 'legacy_real']);

      // Build ledger balances per user
      const ledgerBalances: Record<string, number> = {};
      ((ledgerEntries as any[]) || []).forEach((e) => {
        if (!e.user_id) return;
        if (!ledgerBalances[e.user_id]) ledgerBalances[e.user_id] = 0;
        const amt = Number(e.amount);
        if (e.direction === 'cash_in') ledgerBalances[e.user_id] += amt;
        else if (e.direction === 'cash_out') ledgerBalances[e.user_id] -= amt;
      });

      let walletDriftCount = 0;
      (wallets || []).forEach((w) => {
        const ledgerBal = ledgerBalances[w.user_id] ?? 0;
        const diff = Math.abs(Number(w.balance) - ledgerBal);
        if (diff > 100) walletDriftCount++;
      });

      // 2. Missing transaction_group_id in last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recentEntries } = await supabase
        .from('general_ledger')
        .select('id, transaction_group_id')
        .gte('created_at', sevenDaysAgo);

      const missingGroupCount = ((recentEntries as any[]) || []).filter(
        (e) => !e.transaction_group_id
      ).length;

      // 3. Negative ledger balances per user (wallet scope)
      let negativeLedgerCount = 0;
      Object.values(ledgerBalances).forEach((bal) => {
        if (bal < 0) negativeLedgerCount++;
      });

      return {
        walletDriftCount,
        missingGroupCount,
        negativeLedgerCount,
      };
    },
    staleTime: STALE_TIME,
  });

  // Pending approvals from pending_wallet_operations
  const pendingApprovals = useQuery({
    queryKey: ['cfo-overview-pending-approvals'],
    queryFn: async () => {
      const { data, count } = await supabase
        .from('pending_wallet_operations')
        .select('amount', { count: 'exact' })
        .eq('status', 'pending');

      const totalAmount = (data || []).reduce(
        (sum, d) => sum + Number(d.amount || 0),
        0
      );

      return {
        count: count ?? data?.length ?? 0,
        totalAmount,
      };
    },
    staleTime: 60_000,
  });

  // Treasury controls
  const treasuryControls = useQuery({
    queryKey: ['cfo-treasury-controls'],
    queryFn: async () => {
      const { data } = await supabase
        .from('treasury_controls' as any)
        .select('*');

      const controls: Record<string, boolean> = {};
      ((data as any[]) || []).forEach((row: any) => {
        controls[row.control_key] = row.enabled;
      });

      return controls;
    },
    staleTime: 60_000,
  });

  const isLoading =
    channelBalances.isLoading || liabilities.isLoading || revenue.isLoading || moneyFlow.isLoading || receivables.isLoading || cashFlowByPurpose.isLoading;

  return {
    channelBalances: channelBalances.data,
    liabilities: liabilities.data,
    revenue: revenue.data,
    moneyFlow: moneyFlow.data,
    receivables: receivables.data,
    cashFlowByPurpose: cashFlowByPurpose.data,
    todayCashFlow: todayCashFlow.data,
    integrityChecks: integrityChecks.data,
    pendingApprovals: pendingApprovals.data,
    treasuryControls: treasuryControls.data,
    refetchControls: treasuryControls.refetch,
    isLoading,
  };
}

function mapProvider(provider: string | null): string {
  if (!provider) return 'Unassigned';
  const p = provider.toLowerCase();
  if (p.includes('mtn')) return 'MTN';
  if (p.includes('airtel')) return 'Airtel';
  if (p.includes('bank') || p.includes('stanbic') || p.includes('centenary')) return 'Bank';
  if (p.includes('cash')) return 'Cash';
  return 'Unassigned';
}
