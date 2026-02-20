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
    cashAndEquivalents: number;
    receivables: number;
    totalAssets: number;
  };
  platformObligations: {
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

      // Build ledger query helper
      const buildLedgerQuery = (category?: string | string[], direction?: 'cash_in' | 'cash_out') => {
        let q = supabase.from('general_ledger').select('amount, direction, category');
        if (startDate) q = q.gte('transaction_date', startDate.toISOString());
        if (endDate) q = q.lte('transaction_date', endDate.toISOString());
        if (direction) q = q.eq('direction', direction);
        if (category) {
          if (Array.isArray(category)) q = q.in('category', category);
          else q = q.eq('category', category);
        }
        return q;
      };

      // Fetch all ledger entries in period
      const [
        cashInRes,
        cashOutRes,
        rentRequestsRes,
        allTimeBalanceRes,
      ] = await Promise.all([
        buildLedgerQuery(undefined, 'cash_in'),
        buildLedgerQuery(undefined, 'cash_out'),
        supabase.from('rent_requests').select('id, rent_amount, access_fee, request_fee, status, tenant_id, agent_id, created_at'),
        // All-time balance for opening balance
        supabase.from('general_ledger').select('amount, direction').lte('transaction_date', startDate?.toISOString() || new Date(0).toISOString()),
      ]);

      const cashInRows = cashInRes.data || [];
      const cashOutRows = cashOutRes.data || [];
      const rentRequests = rentRequestsRes.data || [];
      const prevRows = allTimeBalanceRes.data || [];

      const sumBy = (rows: any[], cats: string[]) =>
        rows.filter(r => cats.includes(r.category)).reduce((s, r) => s + Number(r.amount), 0);

      const sumAll = (rows: any[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

      // ── INCOME STATEMENT ──
      const accessFees = sumBy(cashInRows, ['tenant_access_fee', 'access_fee']);
      const requestFees = sumBy(cashInRows, ['tenant_request_fee', 'request_fee']);
      const otherServiceIncome = sumBy(cashInRows, ['platform_service_income', 'landlord_platform_fee', 'management_fee']);
      const platformRewards = sumBy(cashOutRows, ['supporter_platform_rewards', 'supporter_reward', 'investment_reward']);
      const agentCommissions = sumBy(cashOutRows, ['agent_commission_payout', 'agent_commission', 'agent_payout', 'agent_approval_bonus', 'referral_bonus']);
      const transactionExpenses = sumBy(cashOutRows, ['transaction_platform_expenses']);
      const operatingExpenses = sumBy(cashOutRows, ['operational_expenses', 'wallet_withdrawal']);

      const totalRevenue = accessFees + requestFees + otherServiceIncome;
      const totalServiceCosts = platformRewards + agentCommissions + transactionExpenses;
      const netOperatingIncome = totalRevenue - totalServiceCosts - operatingExpenses;

      // ── CASH FLOW ──
      const tenantFeesReceived = sumBy(cashInRows, ['tenant_access_fee', 'tenant_request_fee', 'access_fee', 'request_fee']);
      const rentRepayments = sumBy(cashInRows, ['rent_repayment', 'loan_repayment']);
      const depositsReceived = sumBy(cashInRows, ['deposit', 'wallet_deposit', 'agent_deposit', 'wallet_transfer']);
      const platformRewardsPaid = sumBy(cashOutRows, ['supporter_platform_rewards', 'supporter_reward', 'investment_reward']);
      const agentCommissionsPaid = sumBy(cashOutRows, ['agent_commission_payout', 'agent_commission', 'agent_payout', 'agent_approval_bonus', 'referral_bonus']);
      const withdrawalsPaid = sumBy(cashOutRows, ['wallet_withdrawal', 'landlord_payout', 'landlord_payout_request']);
      const netOperating = tenantFeesReceived + rentRepayments + depositsReceived - platformRewardsPaid - agentCommissionsPaid - withdrawalsPaid;

      const supporterCapitalInflows = sumBy(cashInRows, ['supporter_facilitation_capital', 'supporter_deposit', 'investment_deposit']);
      const supporterCapitalWithdrawals = sumBy(cashOutRows, ['supporter_withdrawal', 'investment_withdrawal']);
      const netFinancing = supporterCapitalInflows - supporterCapitalWithdrawals;
      const netCashMovement = netOperating + netFinancing;

      const openingBalance = prevRows.reduce((s, r) => r.direction === 'cash_in' ? s + Number(r.amount) : s - Number(r.amount), 0);
      const closingBalance = openingBalance + netCashMovement;

      // ── BALANCE SHEET ──
      const totalCashIn = sumAll(cashInRows);
      const totalCashOut = sumAll(cashOutRows);
      const cashAndEquivalents = Math.max(0, totalCashIn - totalCashOut);
      const pendingWithdrawals = sumBy(cashOutRows, ['wallet_withdrawal']);
      const accruedPlatformRewards = platformRewards * 0.1;
      const agentCommissionsPayable = agentCommissions * 0.05;
      const totalObligations = pendingWithdrawals * 0.1 + accruedPlatformRewards + agentCommissionsPayable;
      const totalAssets = cashAndEquivalents;
      const retainedOperatingSurplus = totalAssets - totalObligations;

      // ── FACILITATED VOLUME ──
      const approvedRequests = rentRequests.filter(r => r.status === 'approved' || r.status === 'funded' || r.status === 'disbursed');
      const pendingRequestsList = rentRequests.filter(r => r.status === 'pending');
      const totalFacilitatedRentVolume = approvedRequests.reduce((s, r) => s + Number(r.rent_amount), 0);
      const totalAccessFeeIncome = approvedRequests.reduce((s, r) => s + Number(r.access_fee || 0), 0);
      const totalRequestFeeIncome = approvedRequests.reduce((s, r) => s + Number(r.request_fee || 0), 0);
      const uniqueTenants = new Set(rentRequests.map(r => r.tenant_id)).size;
      const uniqueAgents = new Set(rentRequests.filter(r => r.agent_id).map(r => r.agent_id)).size;
      const averageRentAmount = approvedRequests.length > 0 ? totalFacilitatedRentVolume / approvedRequests.length : 0;
      const supporterCapitalDeployed = sumBy(cashInRows, ['supporter_facilitation_capital', 'supporter_deposit', 'investment_deposit']);

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
          financingActivities: { supporterCapitalInflows, supporterCapitalWithdrawals, netFinancing },
          netCashMovement,
          openingBalance: Math.max(0, openingBalance),
          closingBalance: Math.max(0, closingBalance),
        },
        balanceSheet: {
          assets: { cashAndEquivalents, receivables: 0, totalAssets },
          platformObligations: { pendingWithdrawals: pendingWithdrawals * 0.1, accruedPlatformRewards, agentCommissionsPayable, totalObligations },
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
    setFilters(f => ({ ...f, period, startDate: null, endDate: null }));
  }, []);

  return { data, loading, filters, generate, updatePeriod, setFilters };
}
