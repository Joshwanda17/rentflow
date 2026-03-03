/**
 * Agent Advance Compound Interest Calculations
 * 33% daily compound interest over 30-day cycles
 */

export interface DayProjection {
  day: number;
  openingBalance: number;
  interestAccrued: number;
  estimatedDeduction: number;
  closingBalance: number;
}

export function calculateCompoundProjection(
  principal: number,
  dailyRate: number = 0.33,
  days: number = 30
): DayProjection[] {
  const projections: DayProjection[] = [];
  let balance = principal;

  for (let day = 1; day <= days; day++) {
    const interest = Math.round(balance * dailyRate);
    const newBalance = balance + interest;
    // Estimated even daily deduction to clear in remaining days
    const remaining = days - day + 1;
    const estimatedDeduction = remaining > 0 ? Math.round(newBalance / remaining) : newBalance;

    projections.push({
      day,
      openingBalance: balance,
      interestAccrued: interest,
      estimatedDeduction,
      closingBalance: newBalance,
    });

    balance = newBalance;
  }

  return projections;
}

export function calculateTotalProjected(principal: number, dailyRate: number = 0.33, days: number = 30): number {
  let balance = principal;
  for (let i = 0; i < days; i++) {
    balance += Math.round(balance * dailyRate);
  }
  return balance;
}

export function calculateEstimatedDailyDeduction(principal: number, dailyRate: number = 0.33, days: number = 30): number {
  const total = calculateTotalProjected(principal, dailyRate, days);
  return Math.round(total / days);
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

export function formatUGX(amount: number): string {
  return `UGX ${Math.round(amount).toLocaleString()}`;
}
