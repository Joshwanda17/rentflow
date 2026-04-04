import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, subDays, startOfMonth, startOfYear } from 'date-fns';

export type StatementPeriod = 'today' | '7days' | '30days' | 'month' | 'year' | 'all';

export interface StatementFilters {
  period: StatementPeriod;
  startDate: Date | null;
  endDate: Date | null;
}

export interface IncomeStatementData {
  period: string;
  revenue: {
    accessFees: number;
    requestFees: number;
    otherServiceIncome: number;
    total: number;
  };
  serviceDeliveryCosts: {
    platformRewards: number;
    agentCommissions: number;
    transactionExpenses: number;
    total: number;
  };
  operatingExpenses: number;
  netOperatingIncome: number;
}

export interface CashFlowData {
  period: string;
  operatingActivities: {
    tenantFeesReceived: number;
    rentRepayments: number;
    depositsReceived: number;
    platformRewardsPaid: number;
    agentCommissionsPaid: number;
    withdrawalsPaid: number;
    netOperating: number;
  };
  custodialActivities: {
    userDeposits: number;
    userWithdrawals: number;
    userTransfers: number;
    netCustodial: number;
  };
  financingActivities: {
    supporterCapitalInflows: number;
    supporterCapitalWithdrawals: number;
    netFinancing: number;
  };
  netCashMovement: number;
  openingBalance: number;
  closingBalance: number;
}

export interface BalanceSheetData {
  assets: {
    platformCash: number;
    userFundsHeld: number;
    receivables: number;
    totalAssets: number;
  };
  platformObligations: {
    userWalletCustody: number;
    pendingWithdrawals: number;
    accruedPlatformRewards: number;
    agentCommissionsPayable: number;
    totalObligations: number;
  };
  platformEquity: {
    retainedOperatingSurplus: number;
    totalEquity: number;
  };
}

export interface FacilitatedVolumeData {
  totalFacilitatedRentVolume: number;
  totalRentRequests: number;
  approvedRequests: number;
  pendingRequests: number;
  totalAccessFeeIncome: number;
  totalRequestFeeIncome: number;
  activeTenants: number;
  activeAgents: number;
  averageRentAmount: number;
  supporterCapitalDeployed: number;
}

export interface FinancialStatementsData {
  incomeStatement: IncomeStatementData;
  cashFlow: CashFlowData;
  balanceSheet: BalanceSheetData;
  facilitatedVolume: FacilitatedVolumeData;
  generatedAt: Date;
  filters: StatementFilters;
}

function getPeriodDates(period: StatementPeriod): { start: Date | null; end: Date | null } {
  const now = new Date();
  switch (period) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case '7days': return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
    case '30days': return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
    case 'month': return { start: startOfMonth(now), end: endOfDay(now) };
    case 'year': return { start: startOfYear(now), end: endOfDay(now) };
    default: return { start: null, end: null };
  }
}

function formatPeriodLabel(filters: StatementFilters): string {
  const { start, end } = getPeriodDates(filters.period);
  const s = filters.startDate || start;
  const e = filters.endDate || end;
  if (!s && !e) return 'All Time';
  const fmt = (d: Date) => d.toLocaleDateString('en-UG', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!s) return `Up to ${fmt(e!)}`;
  if (!e) return `From ${fmt(s)}`;
  return `${fmt(s)} — ${fmt(e)}`;
}

export function useFinancialStatements() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FinancialStatementsData | null>(null);
  const [filters, setFilters] = useState<StatementFilters>({
    period: '30days',
    startDate: null,
    endDate: null,
  });

  const generate = useCallback(async (overrideFilters?: StatementFilters) => {
    const activeFilters = overrideFilters || filters;
    setLoading(true);

    try {
      const { start, end } = getPeriodDates(activeFilters.period);
      const startDate = activeFilters.startDate || start;
      const endDate = activeFilters.endDate || end;

      // Helper: build scoped ledger query
      const buildScopedQuery = (scope: 'platform' | 'wallet' | 'bridge', direction?: 'cash_in' | 'cash_out') => {
        let q = supabase.from('general_ledger').select('amount, direction, category, ledger_scope');
        if (startDate) q = q.gte('transaction_date', startDate.toISOString());
        if (endDate) q = q.lte('transaction_date', endDate.toISOString());
        q = q.eq('ledger_scope', scope);
        if (direction) q = q.eq('direction', direction);
        return q;
      };

      const [
        // Platform-scoped (revenue & expenses)
        platformInRes,
        platformOutRes,
        // Wallet-scoped (user custody flows)
        walletInRes,
        walletOutRes,
        // Bridge-scoped (capital flows affecting both)
        bridgeInRes,
        bridgeOutRes,
        // Current user wallet balances (custodial liability)
        walletsRes,
        // Rent requests for facilitated volume
        rentRequestsRes,
        // All-time platform balance for opening balance
        prevPlatformRes,
        // All-time platform entries for Balance Sheet (no date filter)
        allTimePlatformRes,
      ] = await Promise.all([
        buildScopedQuery('platform', 'cash_in'),
        buildScopedQuery('platform', 'cash_out'),
        buildScopedQuery('wallet', 'cash_in'),
        buildScopedQuery('wallet', 'cash_out'),
        buildScopedQuery('bridge', 'cash_in'),
        buildScopedQuery('bridge', 'cash_out'),
        supabase.from('wallets').select('balance'),
        supabase.from('rent_requests').select('id, rent_amount, access_fee, request_fee, status, tenant_id, agent_id, created_at'),
        (() => {
          // Fix #1: No opening balance for "All Time" — prevents double-counting
          if (!startDate) return Promise.resolve({ data: [], error: null });
          let q = supabase.from('general_ledger').select('amount, direction, category, ledger_scope');
          q = q.lt('transaction_date', startDate.toISOString());
          q = q.eq('ledger_scope', 'platform');
          q = q.neq('category', 'opening_balance');
          return q;
        })(),
        // All-time platform query for Balance Sheet platformCash (unfiltered by date)
        // Paginate to avoid the 1000-row default cap
        (async () => {
          const allRows: any[] = [];
          const PAGE = 1000;
          let offset = 0;
          let hasMore = true;
          while (hasMore) {
            const { data: page, error } = await supabase
              .from('general_ledger')
              .select('amount, direction, category')
              .eq('ledger_scope', 'platform')
              .neq('category', 'opening_balance')
              .range(offset, offset + PAGE - 1);
            if (error) throw error;
            if (page && page.length > 0) {
              allRows.push(...page);
              offset += PAGE;
              hasMore = page.length === PAGE;
            } else {
              hasMore = false;
            }
          }
          return { data: allRows, error: null };
        })(),
      ]);

      const platformIn = platformInRes.data || [];
      const platformOut = platformOutRes.data || [];
      const walletIn = walletInRes.data || [];
      const walletOut = walletOutRes.data || [];
      const bridgeIn = bridgeInRes.data || [];
      const bridgeOut = bridgeOutRes.data || [];
      const wallets = walletsRes.data || [];
      const rentRequests = rentRequestsRes.data || [];
      const prevPlatform = prevPlatformRes.data || [];
      const allTimePlatform = allTimePlatformRes.data || [];

      // Fix #2: Exclude 'opening_balance' migration artifacts from all aggregations
      const excludeSynthetic = (rows: any[]) => rows.filter(r => r.category !== 'opening_balance');
      const sumBy = (rows: any[], cats: string[]) =>
        excludeSynthetic(rows).filter(r => cats.includes(r.category)).reduce((s, r) => s + Number(r.amount), 0);
      const sumAll = (rows: any[]) => excludeSynthetic(rows).reduce((s, r) => s + Number(r.amount), 0);
      const sumWithDirectionFallback = (
        preferredRows: any[],
        fallbackRows: any[],
        categories: string[],
      ) => {
        // Per-category fallback: check each category individually
        return categories.reduce((total, cat) => {
          const preferred = sumBy(preferredRows, [cat]);
          return total + (preferred > 0 ? preferred : sumBy(fallbackRows, [cat]));
        }, 0);
      };

      // ══════════════════════════════════════════════════════════════
      // INCOME STATEMENT — Platform scope ONLY (earned revenue & costs)
      // User wallet deposits/withdrawals are NOT revenue or expenses.
      // ══════════════════════════════════════════════════════════════
      const accessFees = sumWithDirectionFallback(platformIn, platformOut, ['tenant_access_fee', 'access_fee']);
      const requestFees = sumWithDirectionFallback(platformIn, platformOut, ['tenant_request_fee', 'request_fee']);
      const otherServiceIncome = sumWithDirectionFallback(platformIn, platformOut, ['platform_service_income', 'landlord_platform_fee', 'management_fee']);
      const platformRewards = sumWithDirectionFallback(platformOut, platformIn, ['supporter_platform_rewards', 'supporter_reward', 'investment_reward', 'roi_payout']);
      const agentCommissions = sumWithDirectionFallback(platformOut, platformIn, ['agent_commission_payout', 'agent_commission', 'agent_payout', 'agent_approval_bonus', 'referral_bonus']);
      const transactionExpenses = sumWithDirectionFallback(platformOut, platformIn, ['transaction_platform_expenses']);
      const operatingExpenses = sumWithDirectionFallback(platformOut, platformIn, ['operational_expenses', 'platform_expense']);

      const totalRevenue = accessFees + requestFees + otherServiceIncome;
      const totalServiceCosts = platformRewards + agentCommissions + transactionExpenses;
      const netOperatingIncome = totalRevenue - totalServiceCosts - operatingExpenses;

      // ══════════════════════════════════════════════════════════════
      // CASH FLOW — Separated into platform ops, custodial, & financing
      // ══════════════════════════════════════════════════════════════

      // Operating (platform scope only)
      const tenantFeesReceived = accessFees + requestFees;
      const rentRepayments = sumWithDirectionFallback(platformIn, platformOut, ['rent_repayment', 'loan_repayment']);
      const depositsReceived = sumWithDirectionFallback(platformIn, platformOut, ['platform_service_income', 'landlord_platform_fee', 'management_fee']);
      const platformRewardsPaid = platformRewards;
      const agentCommissionsPaid = agentCommissions;
      const withdrawalsPaid = operatingExpenses + transactionExpenses;
      const netOperating = tenantFeesReceived + rentRepayments + depositsReceived - platformRewardsPaid - agentCommissionsPaid - withdrawalsPaid;

      // Custodial (wallet scope — user money in/out of platform custody)
      // Fix #3: Only count actual user deposits/withdrawals, not internal flows
      const userDeposits = sumBy(walletIn, ['deposit', 'wallet_deposit', 'pending_portfolio_topup']);
      const userWithdrawals = sumBy(walletOut, ['wallet_withdrawal']);
      const userTransfers = 0; // internal wallet-to-wallet are net zero
      const netCustodial = userDeposits - userWithdrawals;

      // Financing (bridge scope — supporter capital)
      const supporterCapitalInflows = sumBy(bridgeIn, ['supporter_facilitation_capital', 'supporter_deposit', 'investment_deposit']);
      const supporterCapitalWithdrawals = sumBy(bridgeOut, ['supporter_withdrawal', 'investment_withdrawal']);
      const netFinancing = supporterCapitalInflows - supporterCapitalWithdrawals;

      // Platform cash movement only (excludes custodial)
      const netCashMovement = netOperating + netFinancing;
      const openingBalance = prevPlatform.reduce(
        (s, r) => r.direction === 'cash_in' ? s + Number(r.amount) : s - Number(r.amount), 0
      );
      const closingBalance = openingBalance + netCashMovement;

      // ══════════════════════════════════════════════════════════════
      // BALANCE SHEET — Platform assets vs obligations
      // User wallet balances = custodial LIABILITY (not our money)
      // ══════════════════════════════════════════════════════════════
      // Platform Cash = All-time cumulative retained earnings (Balance Sheet is a point-in-time snapshot)
      // Uses the SAME direction-fallback logic as the Income Statement for consistency
      const revenueCategories = ['tenant_access_fee', 'access_fee', 'tenant_request_fee', 'request_fee', 'platform_service_income', 'landlord_platform_fee', 'management_fee'];
      const costCategories = ['supporter_platform_rewards', 'supporter_reward', 'investment_reward', 'roi_payout', 'agent_commission_payout', 'agent_commission', 'agent_payout', 'agent_approval_bonus', 'referral_bonus', 'transaction_platform_expenses', 'operational_expenses', 'platform_expense'];
      const allTimePlatformIn = allTimePlatform.filter(e => e.direction === 'cash_in');
      const allTimePlatformOut = allTimePlatform.filter(e => e.direction === 'cash_out');
      const allTimeRevenue = sumWithDirectionFallback(allTimePlatformIn, allTimePlatformOut, revenueCategories);
      const allTimeCosts = sumWithDirectionFallback(allTimePlatformOut, allTimePlatformIn, costCategories);
      const platformCash = Math.max(0, allTimeRevenue - allTimeCosts);

      const userFundsHeld = (wallets || []).reduce((s, w) => s + (w.balance || 0), 0);

      // Receivables: outstanding rent that's been funded but not fully repaid
      const outstandingRent = rentRequests
        .filter(r => ['funded', 'disbursed', 'repaying'].includes(r.status))
        .reduce((s, r) => s + Number(r.rent_amount || 0), 0);

      const totalAssets = platformCash + userFundsHeld + outstandingRent;

      // Obligations
      const userWalletCustody = userFundsHeld; // We owe this back to users
      const pendingWithdrawals = sumBy(platformOut, ['wallet_withdrawal']) * 0.1;
      const accruedPlatformRewards = platformRewards * 0.1;
      const agentCommissionsPayable = agentCommissions * 0.05;
      const totalObligations = userWalletCustody + pendingWithdrawals + accruedPlatformRewards + agentCommissionsPayable;

      const retainedOperatingSurplus = totalAssets - totalObligations;

      // ── FACILITATED VOLUME ──
      const approvedRequests = rentRequests.filter(r => ['approved', 'funded', 'disbursed', 'repaying'].includes(r.status));
      const pendingRequestsList = rentRequests.filter(r => r.status === 'pending');
      const totalFacilitatedRentVolume = approvedRequests.reduce((s, r) => s + Number(r.rent_amount), 0);
      const totalAccessFeeIncome = approvedRequests.reduce((s, r) => s + Number(r.access_fee || 0), 0);
      const totalRequestFeeIncome = approvedRequests.reduce((s, r) => s + Number(r.request_fee || 0), 0);
      const uniqueTenants = new Set(rentRequests.map(r => r.tenant_id)).size;
      const uniqueAgents = new Set(rentRequests.filter(r => r.agent_id).map(r => r.agent_id)).size;
      const averageRentAmount = approvedRequests.length > 0 ? totalFacilitatedRentVolume / approvedRequests.length : 0;
      const supporterCapitalDeployed = sumBy(bridgeIn, ['supporter_facilitation_capital', 'supporter_deposit', 'investment_deposit']);

      const result: FinancialStatementsData = {
        generatedAt: new Date(),
        filters: activeFilters,
        incomeStatement: {
          period: formatPeriodLabel(activeFilters),
          revenue: { accessFees, requestFees, otherServiceIncome, total: totalRevenue },
          serviceDeliveryCosts: { platformRewards, agentCommissions, transactionExpenses, total: totalServiceCosts },
          operatingExpenses,
          netOperatingIncome,
        },
        cashFlow: {
          period: formatPeriodLabel(activeFilters),
          operatingActivities: { tenantFeesReceived, rentRepayments, depositsReceived, platformRewardsPaid, agentCommissionsPaid, withdrawalsPaid, netOperating },
          custodialActivities: { userDeposits, userWithdrawals, userTransfers, netCustodial },
          financingActivities: { supporterCapitalInflows, supporterCapitalWithdrawals, netFinancing },
          netCashMovement,
          openingBalance: Math.max(0, openingBalance),
          closingBalance: Math.max(0, closingBalance),
        },
        balanceSheet: {
          assets: { platformCash, userFundsHeld, receivables: outstandingRent, totalAssets },
          platformObligations: { userWalletCustody, pendingWithdrawals, accruedPlatformRewards, agentCommissionsPayable, totalObligations },
          platformEquity: { retainedOperatingSurplus, totalEquity: retainedOperatingSurplus },
        },
        facilitatedVolume: {
          totalFacilitatedRentVolume,
          totalRentRequests: rentRequests.length,
          approvedRequests: approvedRequests.length,
          pendingRequests: pendingRequestsList.length,
          totalAccessFeeIncome,
          totalRequestFeeIncome,
          activeTenants: uniqueTenants,
          activeAgents: uniqueAgents,
          averageRentAmount,
          supporterCapitalDeployed,
        },
      };

      setData(result);
      return result;
    } catch (err) {
      console.error('Financial statements generation failed:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const updatePeriod = useCallback((period: StatementPeriod) => {
    const newFilters: StatementFilters = { ...filters, period, startDate: null, endDate: null };
    setFilters(newFilters);
    generate(newFilters);
  }, [filters, generate]);

  return { data, loading, filters, generate, updatePeriod, setFilters };
}
