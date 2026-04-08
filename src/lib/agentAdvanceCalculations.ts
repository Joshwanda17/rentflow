/**
 * Agent Advance Calculations
 * 33% monthly compound interest with variable repayment periods
 */

export const MONTHLY_RATE = 0.33;
export const REPAYMENT_PERIODS = [7, 14, 30, 60, 90] as const;
export type RepaymentPeriod = (typeof REPAYMENT_PERIODS)[number];

export interface DayProjection {
  day: number;
  openingBalance: number;
  interestAccrued: number;
  closingBalance: number;
}

/**
 * Registration fee: UGX 10,000 if principal ≤ 200,000; UGX 20,000 if > 200,000
 */
export function calculateRegistrationFee(principal: number): number {
  return principal <= 200000 ? 10000 : 20000;
}

/**
 * Access fee: principal × (1.33^(days/30) - 1)
 */
export function calculateAccessFee(principal: number, days: number, monthlyRate: number = MONTHLY_RATE): number {
  return Math.round(principal * (Math.pow(1 + monthlyRate, days / 30) - 1));
}

/**
 * Total payable = principal + access fee + registration fee
 */
export function calculateTotalPayable(principal: number, days: number, monthlyRate: number = MONTHLY_RATE): number {
  return principal + calculateAccessFee(principal, days, monthlyRate) + calculateRegistrationFee(principal);
}

/**
 * Daily payment = total ÷ period days
 */
export function calculateDailyPayment(principal: number, days: number, monthlyRate: number = MONTHLY_RATE): number {
  return Math.ceil(calculateTotalPayable(principal, days, monthlyRate) / days);
}

/**
 * Day-by-day projection showing monthly compounding growth
 * Daily interest rate derived from monthly: (1.33^(1/30) - 1)
 */
export function calculateCompoundProjection(
  principal: number,
  days: number = 30,
  monthlyRate: number = MONTHLY_RATE
): DayProjection[] {
  const dailyRate = Math.pow(1 + monthlyRate, 1 / 30) - 1;
  const projections: DayProjection[] = [];
  let balance = principal;

  for (let day = 1; day <= days; day++) {
    const interest = Math.round(balance * dailyRate);
    const newBalance = balance + interest;

    projections.push({
      day,
      openingBalance: balance,
      interestAccrued: interest,
      closingBalance: newBalance,
    });

    balance = newBalance;
  }

  return projections;
}

export function getRiskLevel(advance: {
  outstanding_balance: number;
  principal: number;
  status: string;
}): 'green' | 'yellow' | 'red' {
  if (advance.status === 'overdue') return 'red';
  if (advance.status === 'completed') return 'green';
  const ratio = advance.outstanding_balance / Math.max(advance.principal, 1);
  if (ratio > 3) return 'red';
  if (ratio > 1.5) return 'yellow';
  return 'green';
}

import { formatDynamic } from '@/lib/currencyFormat';

export function formatUGX(amount: number): string {
  return formatDynamic(amount);
}
