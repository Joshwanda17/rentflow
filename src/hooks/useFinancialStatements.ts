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
    referralBonuses: number;
    agentBonuses: number;
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
  adjustments: {
    walletDeductions: number;
    systemCorrections: number;
    orphanReassignments: number;
    orphanReversals: number;
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
    agentCommissionWithdrawals: number;
    agentCommissionUsedForRent: number;
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
    rentPrincipalCollected: number;
    agentRepayments: number;
    advanceRepayments: number;
    rentDeployments: number;
    rentDisbursements: number;
    netFacilitation: number;
  };
  custodialActivities: {
    userDeposits: number;
    userWithdrawals: number;
    userTransfers: number;
    walletDeductions: number;
    roiWalletCredits: number;
    agentFloatUsedForRent: number;
    walletCommissionCredits: number;
    walletCorrectionCredits: number;
    walletCorrectionDebits: number;
    rentFloatFunding: number;
    netCustodial: number;
  };
  financingActivities: {
    supporterCapitalInflows: number;
    partnerFunding: number;
    shareCapital: number;
    roiReinvestment: number;
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
    rentReceivablesCreated: number;
    advanceAccessFeeReceivables: number;
    promissoryNotesReceivable: number;
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

      // Helper: build scoped ledger query — fetches ALL rows via pagination
      const fetchAllScoped = async (scope: 'platform' | 'wallet' | 'bridge', direction?: 'cash_in' | 'cash_out') => {
        const pageSize = 5000;
        let allRows: any[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          let q = supabase.from('general_ledger').select('amount, direction, category, ledger_scope, description');
          if (startDate) q = q.gte('transaction_date', startDate.toISOString());
          if (endDate) q = q.lte('transaction_date', endDate.toISOString());
          q = q.eq('ledger_scope', scope);
          q = q.in('classification', ['production', 'legacy_real']);
          if (direction) q = q.eq('direction', direction);
          q = q.range(offset, offset + pageSize - 1);
          
          const { data } = await q;
          const rows = data || [];
          allRows = allRows.concat(rows);
          hasMore = rows.length === pageSize;
          offset += pageSize;
        }
        return allRows;
      };

      // Helper for prev-period query
      const fetchAllPrevPlatform = async () => {
        if (!startDate) return [];
        const pageSize = 5000;
        let allRows: any[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          let q = supabase.from('general_ledger').select('amount, direction, category, ledger_scope');
          q = q.lt('transaction_date', startDate.toISOString());
          q = q.eq('ledger_scope', 'platform');
          q = q.in('classification', ['production', 'legacy_real']);
          q = q.range(offset, offset + pageSize - 1);
          
          const { data } = await q;
          const rows = data || [];
          allRows = allRows.concat(rows);
          hasMore = rows.length === pageSize;
          offset += pageSize;
        }
        return allRows;
      };

      const [
        platformIn, platformOut,
        walletIn, walletOut,
        bridgeIn, bridgeOut,
        walletsRes, rentRequestsRes, advancesRes,
        prevPlatform, allTimePlatformRes, promissoryNotesRes,
      ] = await Promise.all([
        fetchAllScoped('platform', 'cash_in'),
        fetchAllScoped('platform', 'cash_out'),
        fetchAllScoped('wallet', 'cash_in'),
        fetchAllScoped('wallet', 'cash_out'),
        fetchAllScoped('bridge', 'cash_in'),
        fetchAllScoped('bridge', 'cash_out'),
        supabase.rpc('get_wallet_totals'),
        supabase.from('rent_requests').select('id, rent_amount, access_fee, request_fee, status, tenant_id, agent_id, created_at').limit(10000),
        supabase.from('agent_advances').select('access_fee, access_fee_collected, access_fee_status, status').in('status', ['active', 'overdue']),
        fetchAllPrevPlatform(),
        supabase.rpc('get_platform_cash_summary'),
        supabase.from('promissory_notes').select('amount, total_collected, status').in('status', ['pending', 'activated']),
      ]);

      const walletTotalsData = walletsRes.data as any;
      const wallets = [{ balance: Number(walletTotalsData?.total_balance ?? 0) }];
      const rentRequests = rentRequestsRes.data || [];
      const activeAdvances = advancesRes.data || [];
      const allTimePlatformSummary = allTimePlatformRes.data as any;
      const promissoryNotes = promissoryNotesRes.data || [];

      const excludeSynthetic = (rows: any[]) => rows.filter(r => r.category !== 'opening_balance');
      const sumBy = (rows: any[], cats: string[]) =>
        excludeSynthetic(rows).filter(r => cats.includes(r.category)).reduce((s, r) => s + Number(r.amount), 0);
      const sumWithDirectionFallback = (
        preferredRows: any[], fallbackRows: any[], categories: string[],
      ) => {
        return categories.reduce((total, cat) => {
          const preferred = sumBy(preferredRows, [cat]);
          return total + (preferred > 0 ? preferred : sumBy(fallbackRows, [cat]));
        }, 0);
      };

      // ══════════════════════════════════════════════════════════════
      // INCOME STATEMENT — Platform scope ONLY (earned revenue & costs)
      // ══════════════════════════════════════════════════════════════
      const accessFees = sumWithDirectionFallback(platformIn, platformOut, ['tenant_access_fee', 'access_fee', 'access_fee_collected']);
      const requestFees = sumWithDirectionFallback(platformIn, platformOut, ['tenant_request_fee', 'request_fee', 'registration_fee_collected']);
      const otherServiceIncome = sumWithDirectionFallback(platformIn, platformOut, ['platform_service_income', 'landlord_platform_fee', 'management_fee']);
      const platformRewards = sumWithDirectionFallback(platformOut, platformIn, ['supporter_platform_rewards', 'supporter_reward', 'investment_reward', 'roi_payout', 'roi_expense']);
      const agentCommissions = sumWithDirectionFallback(platformOut, platformIn, ['agent_commission_payout', 'agent_commission', 'agent_commission_earned', 'agent_payout', 'agent_approval_bonus']);
      // Referral & agent bonuses (production + legacy)
      const referralBonuses = sumBy(walletIn, ['referral_bonus']) + sumBy(platformOut, ['referral_bonus']);
      const agentBonuses = sumBy(walletIn, ['agent_bonus']) + sumBy(platformOut, ['agent_bonus']);
      const totalIncentiveCosts = referralBonuses + agentBonuses;
      const transactionExpenses = sumWithDirectionFallback(platformOut, platformIn, ['transaction_platform_expenses']);
      const generalOperating = sumWithDirectionFallback(platformOut, platformIn, ['operational_expenses', 'platform_expense']);
      const payrollExpenses = sumWithDirectionFallback(platformOut, platformIn, ['salary_payment', 'employee_advance']);
      const agentRequisitions = sumWithDirectionFallback(platformOut, platformIn, ['agent_requisition']);
      const financialAgentExpenses = sumWithDirectionFallback(platformOut, platformIn, ['platform_expense_disbursement']);
      // Legacy expenses captured
      const legacyMarketingExpense = sumBy(walletOut, ['marketing_expense']) + sumBy(platformOut, ['marketing_expense']);
      const tenantDefaultCharges = sumBy(walletOut, ['tenant_default_charge']);
      const debtClearance = sumBy(walletOut, ['debt_clearance']);
      // financialAgentExpenses already declared above

      // Subcategory expenses from system_balance_correction entries
      // NOTE: Subcategory tags (e.g. "📢 Marketing Expenses → ...") are on the wallet-in leg,
      // while the platform-out leg has the generic "[expense]" description.
      // We match BOTH sources and take the higher value to avoid double-counting
      // (each CFO credit produces one platform-out + one wallet-in).
      const sumByDescriptionMatch = (rows: any[], pattern: string) =>
        excludeSynthetic(rows)
          .filter(r => r.category === 'system_balance_correction' && r.description && r.description.toLowerCase().includes(pattern.toLowerCase()))
          .reduce((s, r) => s + Number(r.amount), 0);

      // Match from wallet-in (has structured subcategory tags) — this is the reliable source
      const marketingExpenses = sumByDescriptionMatch(walletIn, 'Marketing Expenses');
      const researchDevelopment = sumByDescriptionMatch(walletIn, 'Research & Development');
      const opSubSalaries = sumByDescriptionMatch(walletIn, '→ Salaries') || sumByDescriptionMatch(platformOut, '→ Salaries');
      const opSubTransport = sumByDescriptionMatch(walletIn, '→ Transport') || sumByDescriptionMatch(platformOut, '→ Transport');
      const opSubFood = sumByDescriptionMatch(walletIn, '→ Food') || sumByDescriptionMatch(platformOut, '→ Food');
      const opSubOfficeRent = sumByDescriptionMatch(walletIn, '→ Office Rent') || sumByDescriptionMatch(platformOut, '→ Office Rent');
      const opSubInternet = sumByDescriptionMatch(walletIn, '→ Internet') || sumByDescriptionMatch(platformOut, '→ Internet');
      const opSubAirtime = sumByDescriptionMatch(walletIn, '→ Airtime') || sumByDescriptionMatch(platformOut, '→ Airtime');
      const opSubStationery = sumByDescriptionMatch(walletIn, '→ Stationery') || sumByDescriptionMatch(platformOut, '→ Stationery');
      const opSubPropertyEquipment = sumByDescriptionMatch(walletIn, '→ Property & Equipment') || sumByDescriptionMatch(platformOut, '→ Property & Equipment');
      const opSubTaxes = sumByDescriptionMatch(walletIn, '→ Taxes') || sumByDescriptionMatch(platformOut, '→ Taxes');
      const opSubInterests = sumByDescriptionMatch(walletIn, '→ Interests') || sumByDescriptionMatch(platformOut, '→ Interests');

      const operatingExpensesTotal = generalOperating + payrollExpenses + agentRequisitions + financialAgentExpenses + marketingExpenses + researchDevelopment + legacyMarketingExpense + tenantDefaultCharges + debtClearance + opSubSalaries + opSubTransport + opSubFood + opSubOfficeRent + opSubInternet + opSubAirtime + opSubStationery + opSubPropertyEquipment + opSubTaxes + opSubInterests;

      const advanceAccessFeesCollected = activeAdvances.reduce((s: number, a: any) => s + Number(a.access_fee_collected || 0), 0);

      const totalRevenue = accessFees + requestFees + otherServiceIncome + advanceAccessFeesCollected;
      const totalServiceCosts = platformRewards + agentCommissions + totalIncentiveCosts + transactionExpenses;

      // ── Adjustments (non-revenue, non-expense items that affect net income) ──
      const walletDeductions = sumWithDirectionFallback(platformIn, walletOut, ['wallet_deduction']);
      const systemCorrections = sumWithDirectionFallback(platformIn, platformOut, ['system_balance_correction'])
        - (marketingExpenses + researchDevelopment + opSubSalaries + opSubTransport + opSubFood + opSubOfficeRent + opSubInternet + opSubAirtime + opSubStationery + opSubPropertyEquipment + opSubTaxes + opSubInterests); // exclude already-mapped subcats
      const orphanReassignments = sumBy(platformIn, ['orphan_reassignment']);
      const orphanReversals = sumBy(platformOut, ['orphan_reversal']);
      const adjustmentsTotal = walletDeductions + Math.max(0, systemCorrections) - orphanReversals + orphanReassignments;

      const netOperatingIncome = totalRevenue - totalServiceCosts - operatingExpensesTotal + adjustmentsTotal;

      // ══════════════════════════════════════════════════════════════
      // CASH FLOW — All categories tracked
      // ══════════════════════════════════════════════════════════════

      // Operating (platform scope)
      const tenantFeesReceived = accessFees + requestFees;
      const agentCommissionWithdrawals = sumBy(walletOut, ['agent_commission_withdrawal']);
      const agentCommissionUsedForRent = sumBy(walletOut, ['agent_commission_used_for_rent']);
      const payrollPaid = payrollExpenses;
      const agentRequisitionsPaid = agentRequisitions;
      const financialAgentExpensesPaid = financialAgentExpenses;
      const marketingPaid = marketingExpenses;
      const rdPaid = researchDevelopment;
      const operationalSubcatPaid = opSubSalaries + opSubTransport + opSubFood + opSubOfficeRent + opSubInternet + opSubAirtime + opSubStationery + opSubPropertyEquipment + opSubTaxes + opSubInterests;
      const withdrawalsPaid = generalOperating + transactionExpenses;
      const netOperating = tenantFeesReceived + otherServiceIncome - platformRewards - agentCommissions - payrollPaid - agentRequisitionsPaid - financialAgentExpensesPaid - marketingPaid - rdPaid - operationalSubcatPaid - withdrawalsPaid;

      // Facilitation Activities
      const rentRepayments = sumWithDirectionFallback(platformIn, platformOut, ['rent_repayment', 'loan_repayment', 'tenant_repayment']);
      const rentPrincipalCollected = sumBy(platformIn, ['rent_principal_collected']) + sumBy(walletIn, ['rent_principal_collected']);
      const agentRepayments = sumBy(platformIn, ['agent_repayment']);
      const advanceRepayments = sumBy(walletOut, ['advance_repayment', 'credit_access_repayment']);
      const rentDeployments = sumBy(platformOut, ['pool_rent_deployment', 'rent_facilitation_payout']);
      const rentDisbursements = sumBy(platformOut, ['rent_disbursement']);
      const netFacilitation = rentRepayments + rentPrincipalCollected + agentRepayments + advanceRepayments - rentDeployments - rentDisbursements;

      // Custodial (wallet scope) — includes all legacy wallet categories
      const userDeposits = sumBy(walletIn, ['deposit', 'wallet_deposit', 'agent_float_deposit', 'pending_portfolio_topup']);
      const userWithdrawals = sumBy(walletOut, ['wallet_withdrawal']);
      const userTransfers = sumBy(walletOut, ['wallet_transfer']);
      const cfWalletDeductions = sumBy(walletOut, ['wallet_deduction']);
      const roiWalletCredits = sumBy(walletIn, ['roi_wallet_credit', 'roi_payout']);
      const agentFloatUsedForRent = sumBy(walletOut, ['agent_float_used_for_rent']);
      const walletCommissionCredits = sumBy(walletIn, ['agent_commission_earned', 'agent_commission', 'referral_bonus', 'agent_bonus', 'agent_investment_commission', 'account_merge']);
      const walletCorrectionCredits = sumBy(walletIn, ['system_balance_correction']);
      const walletCorrectionDebits = sumBy(walletOut, ['system_balance_correction']);
      const walletRentDisbursements = sumBy(walletOut, ['rent_disbursement']);
      const walletRoiExpense = sumBy(walletOut, ['roi_expense', 'roi_payout']);
      const rentFloatFunding = sumBy(walletIn, ['rent_float_funding', 'landlord_rent_payment', 'pool_capital_received', 'pool_rent_deployment_reversal', 'rent_obligation_reversal', 'coo_proxy_investment_reversal', 'proxy_investment_commission', 'platform_expense']);
      const walletRepaymentInflows = sumBy(walletIn, ['agent_repayment', 'supporter_rent_fund', 'agent_proxy_investment', 'roi_reinvestment']);
      // Legacy investment/deployment outflows
      const legacyInvestmentOutflows = sumBy(walletOut, ['agent_proxy_investment', 'coo_proxy_investment', 'supporter_rent_fund', 'wallet_to_investment', 'angel_pool_investment', 'rent_payment_for_tenant', 'rent_obligation', 'proxy_partner_withdrawal', 'rent_obligation_reversal_adjustment', 'rent_float_funding', 'pending_portfolio_topup']);
      const netCustodial = userDeposits + roiWalletCredits + walletCommissionCredits + walletCorrectionCredits + rentFloatFunding + walletRepaymentInflows - userWithdrawals - userTransfers - cfWalletDeductions - agentFloatUsedForRent - walletCorrectionDebits - walletRentDisbursements - walletRoiExpense - legacyInvestmentOutflows;

      // Financing (bridge scope)
      const supporterCapitalInflows = sumBy(bridgeIn, ['supporter_facilitation_capital', 'supporter_deposit', 'investment_deposit']);
      const partnerFunding = sumBy(bridgeIn, ['partner_funding']);
      const shareCapital = sumBy(bridgeIn, ['share_capital']);
      const roiReinvestment = sumBy(bridgeIn, ['roi_reinvestment']);
      const supporterCapitalWithdrawals = sumBy(bridgeOut, ['supporter_withdrawal', 'investment_withdrawal']);
      const agentCommissionBridge = sumBy(bridgeOut, ['agent_commission']);
      const netFinancing = supporterCapitalInflows + partnerFunding + shareCapital + roiReinvestment - supporterCapitalWithdrawals - agentCommissionBridge;

      const netCashMovement = netOperating + netFacilitation + netCustodial + netFinancing;
      const openingBalance = prevPlatform.reduce(
        (s, r) => r.direction === 'cash_in' ? s + Number(r.amount) : s - Number(r.amount), 0
      );
      const closingBalance = openingBalance + netCashMovement;

      // ══════════════════════════════════════════════════════════════
      // BALANCE SHEET
      // ══════════════════════════════════════════════════════════════
      const allTimeRevenue = Number(allTimePlatformSummary?.total_revenue ?? 0);
      const allTimeCosts = Number(allTimePlatformSummary?.total_costs ?? 0);
      const platformCash = Math.max(0, allTimeRevenue - allTimeCosts);

      const userFundsHeld = (wallets || []).reduce((s, w) => s + (w.balance || 0), 0);

      const outstandingRent = rentRequests
        .filter(r => ['funded', 'disbursed', 'repaying'].includes(r.status))
        .reduce((s, r) => s + Number(r.rent_amount || 0), 0);

      // Rent Receivables Created (bridge/platform scope)
      const rentReceivablesCreated = sumBy(bridgeIn, ['rent_receivable_created']);

      const advanceAccessFeeReceivables = activeAdvances.reduce((s: number, a: any) =>
        s + (Number(a.access_fee || 0) - Number(a.access_fee_collected || 0)), 0);

      const promissoryNotesReceivable = promissoryNotes.reduce((s: number, n: any) =>
        s + (Number(n.amount || 0) - Number(n.total_collected || 0)), 0);

      const totalAssets = platformCash + userFundsHeld + outstandingRent + rentReceivablesCreated + advanceAccessFeeReceivables + promissoryNotesReceivable;

      const userWalletCustody = userFundsHeld;
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
          serviceDeliveryCosts: { platformRewards, agentCommissions, referralBonuses, agentBonuses, transactionExpenses, total: totalServiceCosts },
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
          adjustments: {
            walletDeductions,
            systemCorrections: Math.max(0, systemCorrections),
            orphanReassignments,
            orphanReversals,
            total: adjustmentsTotal,
          },
          netOperatingIncome,
        },
        cashFlow: {
          period: formatPeriodLabel(activeFilters),
          operatingActivities: {
            tenantFeesReceived, otherServiceIncome, platformRewardsPaid: platformRewards,
            agentCommissionsPaid: agentCommissions, agentCommissionWithdrawals, agentCommissionUsedForRent: agentCommissionUsedForRent,
            payrollPaid, agentRequisitionsPaid, financialAgentExpensesPaid,
            marketingPaid, rdPaid, operationalSubcatPaid, withdrawalsPaid, netOperating,
          },
          facilitationActivities: {
            rentRepayments, rentPrincipalCollected, agentRepayments, advanceRepayments,
            rentDeployments, rentDisbursements, netFacilitation,
          },
          custodialActivities: {
            userDeposits, userWithdrawals, userTransfers,
            walletDeductions: cfWalletDeductions, roiWalletCredits,
            agentFloatUsedForRent, walletCommissionCredits,
            walletCorrectionCredits, walletCorrectionDebits,
            rentFloatFunding, netCustodial,
          },
          financingActivities: {
            supporterCapitalInflows, partnerFunding, shareCapital,
            roiReinvestment, supporterCapitalWithdrawals, netFinancing,
          },
          netCashMovement,
          openingBalance: Math.max(0, openingBalance),
          closingBalance: Math.max(0, closingBalance),
        },
        balanceSheet: {
          assets: {
            platformCash, userFundsHeld, receivables: outstandingRent, rentReceivablesCreated,
            advanceAccessFeeReceivables, promissoryNotesReceivable, totalAssets,
          },
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
