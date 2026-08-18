import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LEDGER_SCOPE, FINAL_WITHDRAWAL_STATUSES } from '@/lib/ledgerConstants';

const STALE_TIME = 300_000; // 5 minutes


export function useCFOOverviewData() {
  // Platform cash from ledger RPCs (source-based, not channel-based)
  const platformCash = useQuery({
    queryKey: ['cfo-overview-platform-cash'],
    queryFn: async () => {
      const { data: treasuryData } = await supabase.rpc('get_treasury_cash_position' as any, {} as any);

      // Money We Have is rebased on the Balance Sheet cash accounts:
      // A1 Cash and Bank + A5 Cash in Transit. This excludes liability legs
      // (e.g. cash_custody_payable) and custody/float offset entries, which a
      // flat platform-scope category sum wrongly netted off treasury cash.
      const treasury = treasuryData as any;
      const a1 = Number(treasury?.a1_cash_and_bank ?? 0);
      const a5 = Number(treasury?.a5_cash_in_transit ?? 0);
      const totalCash = Number(treasury?.total_cash ?? a1 + a5);
      const cashLines = (treasury?.lines as any[]) || [];

      const CATEGORY_LABELS: Record<string, string> = {
        partner_capital_cash_received: 'Partner Capital Received',
        partner_funding: 'Partner Funding',
        share_capital: 'Share Capital (Funders)',
        angel_pool_investment: 'Angel Pool Investments',
        angel_pool_commission: 'Angel Pool Commissions',
        agent_float_deposit: 'Agent Float Issued',
        agent_float_settlement: 'Agent Float Settled Back',
        agent_float_topup: 'Agent Float Top-ups',
        agent_float_funding: 'Agent Float Funding',
        agent_float_used_for_rent: 'Float Used for Rent',
        cash_receipt_in_transit: 'Cash Receipts In Transit',
        cash_in_transit_banked: 'In-Transit Cash Banked',
        treasury_bank_deposit: 'Treasury Bank Deposits',
        cash_at_bank_reclass: 'Bank Reclassifications',
      };

      // Economic grouping: every cash-account category belongs to exactly one
      // group, so no flow is shown twice and offsetting legs of the same
      // movement (e.g. float issued vs float settled) net to a single figure.
      const GROUPS: { key: string; label: string; categories: string[] }[] = [
        {
          key: 'partner_capital',
          label: '🤝 Partner Capital',
          categories: [
            'partner_capital_cash_received',
            'partner_funding',
            'share_capital',
            'angel_pool_investment',
            'angel_pool_commission',
            'pending_portfolio_topup',
            'roi_reinvestment',
          ],
        },
        {
          key: 'partner_returns',
          label: '📈 Partner Returns Paid',
          categories: ['roi_expense', 'roi_wallet_credit', 'supporter_platform_rewards'],
        },
        {
          key: 'agent_float',
          label: '💼 Agent Float (net)',
          categories: [
            'agent_float_deposit',
            'agent_float_settlement',
            'agent_float_topup',
            'agent_float_funding',
            'agent_float_used_for_rent',
          ],
        },
        {
          key: 'user_wallets',
          label: '👛 User Wallet Movements (net)',
          categories: ['wallet_deposit', 'wallet_withdrawal', 'wallet_transfer', 'wallet_deduction'],
        },
        {
          key: 'rent_operations',
          label: '🏠 Rent Operations (net)',
          categories: [
            'rent_principal_collected',
            'rent_disbursement',
            'rent_receivable_created',
            'tenant_repayment',
            'agent_repayment',
            'agent_landlord_payout',
            'access_fee_collected',
            'registration_fee_collected',
          ],
        },
        {
          key: 'agent_commissions',
          label: '👤 Agent Commissions',
          categories: [
            'agent_commission_earned',
            'agent_commission_withdrawal',
            'agent_commission_payout',
            'agent_commission_used_for_rent',
          ],
        },
        {
          key: 'treasury_transit',
          label: '🏦 Treasury Transfers & Banking (net)',
          categories: [
            'cash_receipt_in_transit',
            'cash_in_transit_banked',
            'treasury_bank_deposit',
            'cash_at_bank_reclass',
          ],
        },
        {
          key: 'corrections',
          label: '🔧 Corrections',
          categories: ['system_balance_correction', 'orphan_reassignment', 'orphan_reversal'],
        },
      ];

      const SOURCE_LABELS: Record<string, string> = {
        share_capital: '🏦 Share Capital (Funders)',
        partner_funding: '🤝 Partner Funding',
        tenant_repayment: '💰 Tenant Repayments',
        agent_repayment: '💰 Agent Repayments',
        rent_principal_collected: '🏠 Rent Collections',
        wallet_deposit: '📥 Wallet Deposits',
        wallet_deduction: '🔄 Wallet Deductions / Retractions',
        access_fee_collected: '🎫 Access Fees',
        registration_fee_collected: '📋 Registration Fees',
        system_balance_correction: '🔧 Corrections',
        agent_commission_earned: '👤 Agent Commissions (Expense)',
        roi_expense: '📈 ROI Payouts (Expense)',
        roi_wallet_credit: '📈 ROI Wallet Credits (Expense)',
        rent_disbursement: '🏠 Rent Disbursements (Expense)',
        wallet_withdrawal: '💸 Wallet Withdrawals (Expense)',
        wallet_transfer: '🔀 Wallet Transfers',
        orphan_reassignment: '🔄 Orphan Reassignments',
        orphan_reversal: '🔄 Orphan Reversals',
        agent_float_deposit: '💼 Agent Float Deposits',
        agent_commission_withdrawal: '💸 Commission Withdrawals',
        agent_commission_used_for_rent: '🏠 Commission Used for Rent',
        agent_float_used_for_rent: '🏠 Float Used for Rent',
        roi_reinvestment: '📈 ROI Reinvestments',
        pending_portfolio_topup: '📊 Portfolio Top-ups',
        rent_receivable_created: '📋 Rent Receivables Created',
      };

      const labelFor = (cat: string) =>
        CATEGORY_LABELS[cat] ||
        SOURCE_LABELS[cat] ||
        String(cat).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

      const groupKeyFor = (cat: string) => GROUPS.find((g) => g.categories.includes(cat))?.key ?? 'other';

      type Child = { category: string; label: string; value: number; count?: number };
      const buckets = new Map<string, { key: string; label: string; net: number; count: number; children: Child[] }>();

      for (const e of cashLines) {
        const cat = String(e.category);
        const net = Number(e.net) || 0;
        const count = Number(e.entry_count) || 0;
        const key = groupKeyFor(cat);
        const label = GROUPS.find((g) => g.key === key)?.label ?? '📦 Other Movements';
        const bucket = buckets.get(key) ?? { key, label, net: 0, count: 0, children: [] };
        bucket.net += net;
        bucket.count += count;
        bucket.children.push({ category: cat, label: labelFor(cat), value: net, count });
        buckets.set(key, bucket);
      }

      const toLine = (b: { key: string; label: string; net: number; count: number; children: Child[] }) => ({
        category: b.key,
        label: b.label,
        value: Math.abs(b.net),
        count: b.count,
        children: [...b.children].sort((a, c) => Math.abs(c.value) - Math.abs(a.value)),
      });

      const grouped = Array.from(buckets.values()).filter((b) => Math.round(b.net) !== 0);

      // Every group is a signed net of the A1 + A5 cash legs, so
      // sum(increases) − sum(decreases) equals Money We Have exactly.
      const increases = grouped
        .filter((b) => b.net > 0)
        .map(toLine)
        .sort((a, b) => b.value - a.value);

      const decreases = grouped
        .filter((b) => b.net < 0)
        .map(toLine)
        .sort((a, b) => b.value - a.value);

      const totalIn = increases.reduce((s: number, e: any) => s + e.value, 0);
      const totalOut = decreases.reduce((s: number, e: any) => s + e.value, 0);

      return { totalCash, a1, a5, increases, decreases, totalIn, totalOut };
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

      // Pull every advance so we can show issued / recovered / outstanding and a
      // status breakdown — all from the existing agent_advances table.
      const { data: advances } = await supabase
        .from('agent_advances')
        .select('principal, outstanding_balance, status');

      let advancesPrincipal = 0;
      let advancesOutstandingAll = 0;
      let advancesOutstanding = 0; // active only — feeds totalReceivables (unchanged behaviour)
      const advanceStatusCounts: Record<string, number> = {};
      (advances || []).forEach((a: any) => {
        const principal = Number(a.principal || 0);
        const outstanding = Number(a.outstanding_balance || 0);
        advancesPrincipal += principal;
        advancesOutstandingAll += outstanding;
        advanceStatusCounts[a.status] = (advanceStatusCounts[a.status] || 0) + 1;
        if (a.status === 'active') advancesOutstanding += outstanding;
      });
      // Recovered = everything issued that is no longer outstanding.
      const advancesRecovered = Math.max(0, advancesPrincipal - advancesOutstandingAll);

      return {
        tenantOutstanding,
        advancesOutstanding,
        advancesPrincipal,
        advancesOutstandingAll,
        advancesRecovered,
        advanceStatusCounts,
        totalReceivables: tenantOutstanding + advancesOutstanding,
      };
    },
    staleTime: STALE_TIME,
  });

  // "Money We Owe" = actual wallet balances (same as Financial Ops)
  const liabilities = useQuery({
    queryKey: ['cfo-overview-liabilities'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_wallet_totals');
      if (error) throw error;
      const d = data as any;
      const totalWalletBalance = Number(d.total_balance ?? 0);

      return {
        tenantFunds: totalWalletBalance,
        totalLiabilities: totalWalletBalance,
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

  // Ledger integrity diagnostics — server-side RPC for full-data accuracy
  const integrityChecks = useQuery({
    queryKey: ['cfo-overview-integrity'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ledger_integrity_checks' as any);
      if (error) throw error;
      const result = data as any;
      return {
        walletDriftCount: result?.wallet_drift_count ?? 0,
        missingGroupCount: result?.missing_group_count ?? 0,
        negativeLedgerCount: result?.negative_balance_count ?? 0,
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
    platformCash.isLoading || liabilities.isLoading || revenue.isLoading || moneyFlow.isLoading || receivables.isLoading || cashFlowByPurpose.isLoading;

  return {
    platformCash: platformCash.data,
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
