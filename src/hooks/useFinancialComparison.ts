import { useState, useCallback } from 'react';
import { 
  startOfDay, endOfDay, subDays, subWeeks, subMonths, subYears,
  startOfWeek, startOfMonth, startOfYear, endOfWeek, endOfMonth, endOfYear,
  differenceInDays
} from 'date-fns';
import { useFinancialStatements, type FinancialStatementsData, type StatementFilters } from './useFinancialStatements';

export type ComparisonMode = 'none' | 'dod' | 'wow' | 'mom' | 'yoy';

export interface ComparisonResult {
  current: FinancialStatementsData;
  previous: FinancialStatementsData | null;
  mode: ComparisonMode;
  periodLabel: string;
  prevPeriodLabel: string;
}

function getPreviousPeriodDates(
  currentStart: Date,
  currentEnd: Date,
  mode: ComparisonMode
): { start: Date; end: Date } {
  const daysDiff = differenceInDays(currentEnd, currentStart);

  switch (mode) {
    case 'dod':
      return {
        start: subDays(currentStart, 1),
        end: subDays(currentEnd, 1),
      };
    case 'wow':
      return {
        start: subWeeks(currentStart, 1),
        end: subWeeks(currentEnd, 1),
      };
    case 'mom':
      return {
        start: subMonths(currentStart, 1),
        end: subMonths(currentEnd, 1),
      };
    case 'yoy':
      return {
        start: subYears(currentStart, 1),
        end: subYears(currentEnd, 1),
      };
    default:
      return {
        start: subDays(currentStart, daysDiff + 1),
        end: subDays(currentStart, 1),
      };
  }
}

function getComparisonLabel(mode: ComparisonMode): string {
  switch (mode) {
    case 'dod': return 'vs Previous Day';
    case 'wow': return 'vs Previous Week';
    case 'mom': return 'vs Previous Month';
    case 'yoy': return 'vs Previous Year';
    default: return '';
  }
}

export interface DeltaValue {
  current: number;
  previous: number;
  change: number;
  changePercent: number | null; // null when prev is 0
}

export function computeDelta(current: number, previous: number): DeltaValue {
  const change = current - previous;
  const changePercent = previous !== 0 ? (change / Math.abs(previous)) * 100 : null;
  return { current, previous, change, changePercent };
}

// Extract key metrics from financial data for comparison
export interface ComparisonMetrics {
  // Income Statement
  totalRevenue: DeltaValue;
  accessFees: DeltaValue;
  requestFees: DeltaValue;
  otherServiceIncome: DeltaValue;
  advanceAccessFeesCollected: DeltaValue;
  totalServiceCosts: DeltaValue;
  totalOperatingExpenses: DeltaValue;
  netOperatingIncome: DeltaValue;
  // Cash Flow
  netOperatingCash: DeltaValue;
  netFacilitation: DeltaValue;
  netCustodial: DeltaValue;
  netFinancing: DeltaValue;
  netCashMovement: DeltaValue;
  closingBalance: DeltaValue;
  // Volume
  totalFacilitatedRentVolume: DeltaValue;
  approvedRequests: DeltaValue;
  activeTenants: DeltaValue;
  activeAgents: DeltaValue;
}

export function buildComparisonMetrics(
  current: FinancialStatementsData,
  previous: FinancialStatementsData | null
): ComparisonMetrics | null {
  if (!previous) return null;
  const c = current;
  const p = previous;
  return {
    totalRevenue: computeDelta(c.incomeStatement.revenue.total, p.incomeStatement.revenue.total),
    accessFees: computeDelta(c.incomeStatement.revenue.accessFees, p.incomeStatement.revenue.accessFees),
    requestFees: computeDelta(c.incomeStatement.revenue.requestFees, p.incomeStatement.revenue.requestFees),
    otherServiceIncome: computeDelta(c.incomeStatement.revenue.otherServiceIncome, p.incomeStatement.revenue.otherServiceIncome),
    advanceAccessFeesCollected: computeDelta(c.incomeStatement.revenue.advanceAccessFeesCollected, p.incomeStatement.revenue.advanceAccessFeesCollected),
    totalServiceCosts: computeDelta(c.incomeStatement.serviceDeliveryCosts.total, p.incomeStatement.serviceDeliveryCosts.total),
    totalOperatingExpenses: computeDelta(c.incomeStatement.operatingExpenses.total, p.incomeStatement.operatingExpenses.total),
    netOperatingIncome: computeDelta(c.incomeStatement.netOperatingIncome, p.incomeStatement.netOperatingIncome),
    netOperatingCash: computeDelta(c.cashFlow.operatingActivities.netOperating, p.cashFlow.operatingActivities.netOperating),
    netFacilitation: computeDelta(c.cashFlow.facilitationActivities.netFacilitation, p.cashFlow.facilitationActivities.netFacilitation),
    netCustodial: computeDelta(c.cashFlow.custodialActivities.netCustodial, p.cashFlow.custodialActivities.netCustodial),
    netFinancing: computeDelta(c.cashFlow.financingActivities.netFinancing, p.cashFlow.financingActivities.netFinancing),
    netCashMovement: computeDelta(c.cashFlow.netCashMovement, p.cashFlow.netCashMovement),
    closingBalance: computeDelta(c.cashFlow.closingBalance, p.cashFlow.closingBalance),
    totalFacilitatedRentVolume: computeDelta(c.facilitatedVolume.totalFacilitatedRentVolume, p.facilitatedVolume.totalFacilitatedRentVolume),
    approvedRequests: computeDelta(c.facilitatedVolume.approvedRequests, p.facilitatedVolume.approvedRequests),
    activeTenants: computeDelta(c.facilitatedVolume.activeTenants, p.facilitatedVolume.activeTenants),
    activeAgents: computeDelta(c.facilitatedVolume.activeAgents, p.facilitatedVolume.activeAgents),
  };
}

export function useFinancialComparison() {
  const statements = useFinancialStatements();
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('none');
  const [previousData, setPreviousData] = useState<FinancialStatementsData | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  const generateWithComparison = useCallback(async (mode?: ComparisonMode, overrideFilters?: StatementFilters) => {
    const activeMode = mode ?? comparisonMode;
    
    // Generate current period
    const currentData = await statements.generate(overrideFilters);
    
    if (activeMode === 'none' || !currentData) {
      setPreviousData(null);
      return currentData;
    }

    // Compute previous period dates
    const currentFilters = overrideFilters || statements.filters;
    const { start: currentStart, end: currentEnd } = getResolvedDates(currentFilters);
    
    if (!currentStart || !currentEnd) {
      setPreviousData(null);
      return currentData;
    }

    setLoadingComparison(true);
    try {
      const prevDates = getPreviousPeriodDates(currentStart, currentEnd, activeMode);
      const prevFilters: StatementFilters = {
        period: 'all', // We override with custom dates
        startDate: prevDates.start,
        endDate: prevDates.end,
      };
      
      // Generate previous period using a separate call
      const prevData = await generateStatementsForPeriod(prevFilters);
      setPreviousData(prevData);
    } catch (err) {
      console.error('Comparison generation failed:', err);
      setPreviousData(null);
    } finally {
      setLoadingComparison(false);
    }

    return currentData;
  }, [comparisonMode, statements]);

  // We need a standalone generate function for the previous period
  // This reuses the same logic from useFinancialStatements but with different dates
  const generateStatementsForPeriod = useCallback(async (filters: StatementFilters): Promise<FinancialStatementsData | null> => {
    // Create a temporary instance to generate for prev period
    const tempStatements = useFinancialStatements();
    tempStatements.setFilters(filters);
    return tempStatements.generate(filters);
  }, []);

  const comparisonMetrics = statements.data && previousData
    ? buildComparisonMetrics(statements.data, previousData)
    : null;

  const changeComparisonMode = useCallback((mode: ComparisonMode) => {
    setComparisonMode(mode);
    if (statements.data) {
      generateWithComparison(mode);
    }
  }, [statements.data, generateWithComparison]);

  return {
    ...statements,
    comparisonMode,
    setComparisonMode: changeComparisonMode,
    previousData,
    comparisonMetrics,
    loadingComparison,
    generateWithComparison,
  };
}

function getResolvedDates(filters: StatementFilters): { start: Date | null; end: Date | null } {
  if (filters.startDate && filters.endDate) {
    return { start: filters.startDate, end: filters.endDate };
  }
  const now = new Date();
  switch (filters.period) {
    case 'today': return { start: startOfDay(now), end: endOfDay(now) };
    case '7days': return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
    case '30days': return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
    case 'month': return { start: startOfMonth(now), end: endOfDay(now) };
    case 'year': return { start: startOfYear(now), end: endOfDay(now) };
    default: return { start: null, end: null };
  }
}
