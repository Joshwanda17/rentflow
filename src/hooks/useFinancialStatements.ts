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
    advanceAccessFeesCollected: number;
    total: number;
  };
  serviceDeliveryCosts: {
    platformRewards: number;
    agentCommissions: number;
    transactionExpenses: number;
    total: number;
  };
  operatingExpenses: {
    generalOperating: number;
    payrollExpenses: number;
    agentRequisitions: number;
    financialAgentExpenses: number;
    marketingExpenses: number;
    researchDevelopment: number;
    operationalSubcategories: {
      salaries: number;
      transport: number;
      food: number;
      officeRent: number;
      internet: number;
      airtime: number;
      stationery: number;
      propertyEquipment: number;
      taxes: number;
      interests: number;
    };
    total: number;
  };
  netOperatingIncome: number;
}

export interface CashFlowData {
  period: string;
  operatingActivities: {
    tenantFeesReceived: number;
    otherServiceIncome: number;
    platformRewardsPaid: number;
    agentCommissionsPaid: number;
    payrollPaid: number;
    agentRequisitionsPaid: number;
    financialAgentExpensesPaid: number;
    marketingPaid: number;
    rdPaid: number;
    operationalSubcatPaid: number;
    withdrawalsPaid: number;
    netOperating: number;
  };
  facilitationActivities: {
    rentRepayments: number;
    rentDeployments: number;
    netFacilitation: number;
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
    advanceAccessFeeReceivables: number;
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
        let q = supabase.from('general_ledger').select('amount, direction, category, ledger_scope, description');
        if (startDate) q = q.gte('transaction_date', startDate.toISOString());
        if (endDate) q = q.lte('transaction_date', endDate.toISOString());
        q = q.eq('ledger_scope', scope);
        q = q.in('classification', ['production', 'legacy_real']);
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
        // Active advances for access fee receivables
        advancesRes,
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
        supabase.rpc('get_wallet_totals'),
        supabase.from('rent_requests').select('id, rent_amount, access_fee, request_fee, status, tenant_id, agent_id, created_at'),
        supabase.from('agent_advances').select('access_fee, access_fee_collected, access_fee_status, status').in('status', ['active', 'overdue']),
        (() => {
          // Fix #1: No opening balance for "All Time" — prevents double-counting
          if (!startDate) return Promise.resolve({ data: [], error: null });
           let q = supabase.from('general_ledger').select('amount, direction, category, ledger_scope');
           q = q.lt('transaction_date', startDate.toISOString());
           q = q.eq('ledger_scope', 'platform');
           q = q.in('classification', ['production', 'legacy_real']);
          return q;
        })(),
        // All-time platform cash via server-side RPC (no row limit)
        supabase.rpc('get_platform_cash_summary'),
      ]);

      const platformIn = platformInRes.data || [];
      const platformOut = platformOutRes.data || [];
      const walletIn = walletInRes.data || [];
      const walletOut = walletOutRes.data || [];
      const bridgeIn = bridgeInRes.data || [];
      const bridgeOut = bridgeOutRes.data || [];
      const walletTotalsData = walletsRes.data as any;
      const wallets = [{ balance: Number(walletTotalsData?.total_balance ?? 0) }];
      const rentRequests = rentRequestsRes.data || [];
      const activeAdvances = advancesRes.data || [];
      const prevPlatform = prevPlatformRes.data || [];
      const allTimePlatformSummary = allTimePlatformRes.data as any;

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
      const accessFees = sumWithDirectionFallback(platformIn, platformOut, ['tenant_access_fee', 'access_fee', 'access_fee_collected']);
      const requestFees = sumWithDirectionFallback(platformIn, platformOut, ['tenant_request_fee', 'request_fee', 'registration_fee_collected']);
      const otherServiceIncome = sumWithDirectionFallback(platformIn, platformOut, ['platform_service_income', 'landlord_platform_fee', 'management_fee']);
      const platformRewards = sumWithDirectionFallback(platformOut, platformIn, ['supporter_platform_rewards', 'supporter_reward', 'investment_reward', 'roi_payout']);
      const agentCommissions = sumWithDirectionFallback(platformOut, platformIn, ['agent_commission_payout', 'agent_commission', 'agent_commission_earned', 'agent_payout', 'agent_approval_bonus', 'referral_bonus']);
      const transactionExpenses = sumWithDirectionFallback(platformOut, platformIn, ['transaction_platform_expenses']);
      const generalOperating = sumWithDirectionFallback(platformOut, platformIn, ['operational_expenses', 'platform_expense']);
      const payrollExpenses = sumWithDirectionFallback(platformOut, platformIn, ['salary_payment', 'employee_advance']);
      const agentRequisitions = sumWithDirectionFallback(platformOut, platformIn, ['agent_requisition']);
      const financialAgentExpenses = sumWithDirectionFallback(platformOut, platformIn, ['platform_expense_disbursement']);

      // ── NEW: Parse CFO subcategory expenses from system_balance_correction entries ──
      const sumByDescriptionMatch = (rows: any[], pattern: string) =>
        excludeSynthetic(rows)
          .filter(r => r.category === 'system_balance_correction' && r.description && r.description.toLowerCase().includes(pattern.toLowerCase()))
          .reduce((s, r) => s + Number(r.amount), 0);

      const marketingExpenses = sumByDescriptionMatch(platformOut, 'Marketing Expenses');
      const researchDevelopment = sumByDescriptionMatch(platformOut, 'Research & Development');

      // Operational subcategories
      const opSubSalaries = sumByDescriptionMatch(platformOut, '→ Salaries');
      const opSubTransport = sumByDescriptionMatch(platformOut, '→ Transport');
      const opSubFood = sumByDescriptionMatch(platformOut, '→ Food');
      const opSubOfficeRent = sumByDescriptionMatch(platformOut, '→ Office Rent');
      const opSubInternet = sumByDescriptionMatch(platformOut, '→ Internet');
      const opSubAirtime = sumByDescriptionMatch(platformOut, '→ Airtime');
      const opSubStationery = sumByDescriptionMatch(platformOut, '→ Stationery');
      const opSubPropertyEquipment = sumByDescriptionMatch(platformOut, '→ Property & Equipment');
      const opSubTaxes = sumByDescriptionMatch(platformOut, '→ Taxes');
      const opSubInterests = sumByDescriptionMatch(platformOut, '→ Interests');

      const operatingExpensesTotal = generalOperating + payrollExpenses + agentRequisitions + financialAgentExpenses + marketingExpenses + researchDevelopment + opSubSalaries + opSubTransport + opSubFood + opSubOfficeRent + opSubInternet + opSubAirtime + opSubStationery + opSubPropertyEquipment + opSubTaxes + opSubInterests;

      // Advance Access Fee Revenue (only recognized when collected)
      const advanceAccessFeesCollected = activeAdvances.reduce((s: number, a: any) => s + Number(a.access_fee_collected || 0), 0);

      const totalRevenue = accessFees + requestFees + otherServiceIncome + advanceAccessFeesCollected;
      const totalServiceCosts = platformRewards + agentCommissions + transactionExpenses;
      const netOperatingIncome = totalRevenue - totalServiceCosts - operatingExpensesTotal;

      // ══════════════════════════════════════════════════════════════
      // CASH FLOW — Separated into platform ops, custodial, & financing
      // ══════════════════════════════════════════════════════════════

      // Operating (platform scope only — excludes pass-through facilitation flows)
      const tenantFeesReceived = accessFees + requestFees;
      const platformRewardsPaid = platformRewards;
      const agentCommissionsPaid = agentCommissions;
      const payrollPaid = payrollExpenses;
      const agentRequisitionsPaid = agentRequisitions;
      const financialAgentExpensesPaid = financialAgentExpenses;
      const marketingPaid = marketingExpenses;
      const rdPaid = researchDevelopment;
      const operationalSubcatPaid = opSubSalaries + opSubTransport + opSubFood + opSubOfficeRent + opSubInternet + opSubAirtime + opSubStationery + opSubPropertyEquipment + opSubTaxes + opSubInterests;
      const withdrawalsPaid = generalOperating + transactionExpenses;
      const netOperating = tenantFeesReceived + otherServiceIncome - platformRewardsPaid - agentCommissionsPaid - payrollPaid - agentRequisitionsPaid - financialAgentExpensesPaid - marketingPaid - rdPaid - operationalSubcatPaid - withdrawalsPaid;

      // Facilitation Activities (capital pass-through: tenant repayments ↔ landlord deployments)
      const rentRepayments = sumWithDirectionFallback(platformIn, platformOut, ['rent_repayment', 'loan_repayment']);
      const rentDeployments = sumBy(platformOut, ['pool_rent_deployment', 'rent_facilitation_payout']);
      const netFacilitation = rentRepayments - rentDeployments;

      // Custodial (wallet scope — user money in/out of platform custody)
      // Fix #3: Only count actual user deposits/withdrawals, not internal flows
      const userDeposits = sumBy(walletIn, ['deposit', 'wallet_deposit', 'agent_float_deposit', 'pending_portfolio_topup']);
      const userWithdrawals = sumBy(walletOut, ['wallet_withdrawal']);
      const userTransfers = 0; // internal wallet-to-wallet are net zero
      const netCustodial = userDeposits - userWithdrawals;

      // Financing (bridge scope — supporter capital)
      const supporterCapitalInflows = sumBy(bridgeIn, ['supporter_facilitation_capital', 'supporter_deposit', 'investment_deposit']);
      const supporterCapitalWithdrawals = sumBy(bridgeOut, ['supporter_withdrawal', 'investment_withdrawal']);
      const netFinancing = supporterCapitalInflows - supporterCapitalWithdrawals;

      // Platform cash movement — operating only (facilitation & financing shown separately)
      const netCashMovement = netOperating;
      const openingBalance = prevPlatform.reduce(
        (s, r) => r.direction === 'cash_in' ? s + Number(r.amount) : s - Number(r.amount), 0
      );
      const closingBalance = openingBalance + netCashMovement;

      // ══════════════════════════════════════════════════════════════
      // BALANCE SHEET — Platform assets vs obligations
      // User wallet balances = custodial LIABILITY (not our money)
      // ══════════════════════════════════════════════════════════════
      // Platform Cash = All-time cumulative retained earnings via server-side RPC (no row limit)
      const allTimeRevenue = Number(allTimePlatformSummary?.total_revenue ?? 0);
      const allTimeCosts = Number(allTimePlatformSummary?.total_costs ?? 0);
      const platformCash = Math.max(0, allTimeRevenue - allTimeCosts);

      const userFundsHeld = (wallets || []).reduce((s, w) => s + (w.balance || 0), 0);

      // Receivables: outstanding rent that's been funded but not fully repaid
      const outstandingRent = rentRequests
        .filter(r => ['funded', 'disbursed', 'repaying'].includes(r.status))
        .reduce((s, r) => s + Number(r.rent_amount || 0), 0);

      // Advance Access Fee Receivables: uncollected access fees on active/overdue advances
      const advanceAccessFeeReceivables = activeAdvances.reduce((s: number, a: any) =>
        s + (Number(a.access_fee || 0) - Number(a.access_fee_collected || 0)), 0);

      const totalAssets = platformCash + userFundsHeld + outstandingRent + advanceAccessFeeReceivables;

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
          revenue: { accessFees, requestFees, otherServiceIncome, advanceAccessFeesCollected, total: totalRevenue },
          serviceDeliveryCosts: { platformRewards, agentCommissions, transactionExpenses, total: totalServiceCosts },
          operatingExpenses: {
            generalOperating, payrollExpenses, agentRequisitions, financialAgentExpenses,
            marketingExpenses, researchDevelopment,
            operationalSubcategories: {
              salaries: opSubSalaries, transport: opSubTransport, food: opSubFood,
              officeRent: opSubOfficeRent, internet: opSubInternet, airtime: opSubAirtime,
              stationery: opSubStationery, propertyEquipment: opSubPropertyEquipment,
              taxes: opSubTaxes, interests: opSubInterests,
            },
            total: operatingExpensesTotal,
          },
          netOperatingIncome,
        },
        cashFlow: {
          period: formatPeriodLabel(activeFilters),
          operatingActivities: { tenantFeesReceived, otherServiceIncome, platformRewardsPaid, agentCommissionsPaid, payrollPaid, agentRequisitionsPaid, financialAgentExpensesPaid, marketingPaid, rdPaid, operationalSubcatPaid, withdrawalsPaid, netOperating },
          facilitationActivities: { rentRepayments, rentDeployments, netFacilitation },
          custodialActivities: { userDeposits, userWithdrawals, userTransfers, netCustodial },
          financingActivities: { supporterCapitalInflows, supporterCapitalWithdrawals, netFinancing },
          netCashMovement,
          openingBalance: Math.max(0, openingBalance),
          closingBalance: Math.max(0, closingBalance),
        },
        balanceSheet: {
          assets: { platformCash, userFundsHeld, receivables: outstandingRent, advanceAccessFeeReceivables, totalAssets },
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
