import { useState, useMemo, useCallback } from 'react';
import { 
  Transaction, 
  IncomeStatement, 
  CashFlowStatement, 
  BalanceSheet, 
  FacilitatedVolumeStatement,
  DashboardMetrics 
} from '@/types/financial';

const generateId = () => Math.random().toString(36).substr(2, 9);

export function useFinancialEngine() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTenants, setActiveTenants] = useState(0);
  const [activeAgents, setActiveAgents] = useState(0);

  const addTransaction = useCallback((transaction: Omit<Transaction, 'id'>) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: generateId(),
    };
    setTransactions(prev => [...prev, newTransaction]);

    // Update active counts based on transaction
    if (transaction.linkedParty === 'tenant' && transaction.direction === 'cash_in') {
      setActiveTenants(prev => prev + 1);
    }
    if (transaction.linkedParty === 'agent' && transaction.direction === 'cash_in') {
      setActiveAgents(prev => Math.max(prev, Math.floor(Math.random() * 5) + 1));
    }

    return newTransaction;
  }, []);

  const cashBalance = useMemo(() => {
    return transactions.reduce((balance, tx) => {
      return tx.direction === 'cash_in' 
        ? balance + tx.amount 
        : balance - tx.amount;
    }, 0);
  }, [transactions]);

  const incomeStatement = useMemo((): IncomeStatement => {
    const accessFees = transactions
      .filter(tx => tx.category === 'tenant_access_fee')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const requestFees = transactions
      .filter(tx => tx.category === 'tenant_request_fee')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const otherServiceIncome = transactions
      .filter(tx => tx.category === 'platform_service_income')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const platformRewards = transactions
      .filter(tx => tx.category === 'supporter_platform_rewards')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const agentCommissions = transactions
      .filter(tx => tx.category === 'agent_commission_payout')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const transactionExpenses = transactions
      .filter(tx => tx.category === 'transaction_platform_expenses')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const operatingExpenses = transactions
      .filter(tx => tx.category === 'operational_expenses')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalRevenue = accessFees + requestFees + otherServiceIncome;
    const totalServiceCosts = platformRewards + agentCommissions + transactionExpenses;
    const netOperatingIncome = totalRevenue - totalServiceCosts - operatingExpenses;

    return {
      period: 'Current Period',
      revenue: {
        accessFees,
        requestFees,
        otherServiceIncome,
        total: totalRevenue,
      },
      serviceDeliveryCosts: {
        platformRewards,
        agentCommissions,
        transactionExpenses,
        total: totalServiceCosts,
      },
      operatingExpenses,
      netOperatingIncome,
    };
  }, [transactions]);

  const cashFlowStatement = useMemo((): CashFlowStatement => {
    const tenantFeesReceived = transactions
      .filter(tx => tx.category === 'tenant_access_fee' || tx.category === 'tenant_request_fee')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const rentRepayments = transactions
      .filter(tx => tx.category === 'rent_repayment')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const platformRewardsPaid = transactions
      .filter(tx => tx.category === 'supporter_platform_rewards')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const agentCommissionsPaid = transactions
      .filter(tx => tx.category === 'agent_commission_payout')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const netOperating = tenantFeesReceived + rentRepayments - platformRewardsPaid - agentCommissionsPaid;

    const supporterCapitalInflows = transactions
      .filter(tx => tx.category === 'supporter_facilitation_capital')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const netFinancing = supporterCapitalInflows;

    return {
      period: 'Current Period',
      operatingActivities: {
        tenantFeesReceived,
        rentRepayments,
        platformRewardsPaid,
        agentCommissionsPaid,
        netOperating,
      },
      investingActivities: {
        systemInfrastructure: 0,
        netInvesting: 0,
      },
      financingActivities: {
        supporterCapitalInflows,
        supporterCapitalWithdrawals: 0,
        netFinancing,
      },
      netCashMovement: netOperating + netFinancing,
      openingBalance: 0,
      closingBalance: cashBalance,
    };
  }, [transactions, cashBalance]);

  const balanceSheet = useMemo((): BalanceSheet => {
    const pendingRentFacilitation = transactions
      .filter(tx => tx.category === 'rent_facilitation_payout')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const accruedPlatformRewards = transactions
      .filter(tx => tx.category === 'supporter_platform_rewards')
      .reduce((sum, tx) => sum + tx.amount, 0) * 0.1; // Accrued portion

    const agentCommissionsPayable = transactions
      .filter(tx => tx.category === 'agent_commission_payout')
      .reduce((sum, tx) => sum + tx.amount, 0) * 0.05; // Payable portion

    const totalObligations = pendingRentFacilitation * 0.1 + accruedPlatformRewards + agentCommissionsPayable;
    const totalAssets = cashBalance;
    const retainedOperatingSurplus = totalAssets - totalObligations;

    return {
      assets: {
        cashAndEquivalents: cashBalance,
        receivables: 0,
        platformInfrastructure: 0,
        totalAssets,
      },
      platformObligations: {
        pendingRentFacilitation: pendingRentFacilitation * 0.1,
        accruedPlatformRewards,
        agentCommissionsPayable,
        totalObligations,
      },
      platformEquity: {
        retainedOperatingSurplus,
        totalEquity: retainedOperatingSurplus,
      },
    };
  }, [transactions, cashBalance]);

  const facilitatedVolumeStatement = useMemo((): FacilitatedVolumeStatement => {
    const totalFacilitatedRentVolume = transactions
      .filter(tx => tx.category === 'rent_facilitation_payout')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const supporterCapital = transactions
      .filter(tx => tx.category === 'supporter_facilitation_capital')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const utilizedCapital = Math.min(totalFacilitatedRentVolume, supporterCapital);
    const unutilizedCapital = Math.max(0, supporterCapital - totalFacilitatedRentVolume);

    const tenantCount = Math.max(activeTenants, 1);
    const averageAccessPerTenant = tenantCount > 0 ? totalFacilitatedRentVolume / tenantCount : 0;

    return {
      totalFacilitatedRentVolume,
      utilizedCapital,
      unutilizedCapital,
      activeTenants: tenantCount,
      activeAgents: Math.max(activeAgents, 1),
      averageAccessPerTenant,
    };
  }, [transactions, activeTenants, activeAgents]);

  const dashboardMetrics = useMemo((): DashboardMetrics => {
    return {
      facilitatedRentVolume: facilitatedVolumeStatement.totalFacilitatedRentVolume,
      utilizedCapital: facilitatedVolumeStatement.utilizedCapital,
      activeTenants: facilitatedVolumeStatement.activeTenants,
      activeAgents: facilitatedVolumeStatement.activeAgents,
      platformRevenue: incomeStatement.revenue.total,
      netOperatingIncome: incomeStatement.netOperatingIncome,
    };
  }, [facilitatedVolumeStatement, incomeStatement]);

  return {
    transactions,
    addTransaction,
    cashBalance,
    incomeStatement,
    cashFlowStatement,
    balanceSheet,
    facilitatedVolumeStatement,
    dashboardMetrics,
  };
}
