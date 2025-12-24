// Rent calculation utilities for the platform

export interface RentCalculation {
  rentAmount: number;
  durationDays: 30 | 60 | 90;
  accessFee: number;
  requestFee: number;
  totalRepayment: number;
  dailyRepayment: number;
  accessFeeRate: number;
}

/**
 * Calculate access fee based on duration
 * 33% compounding per month
 */
export function calculateAccessFee(rentAmount: number, durationDays: 30 | 60 | 90): number {
  const months = durationDays / 30;
  // Compounding 33% per month
  const rate = Math.pow(1.33, months) - 1;
  return Math.round(rentAmount * rate);
}

/**
 * Calculate request fee based on rent amount
 * UGX 10,000 for rent <= 200,000
 * UGX 20,000 for rent > 200,000
 */
export function calculateRequestFee(rentAmount: number): number {
  return rentAmount <= 200000 ? 10000 : 20000;
}

/**
 * Calculate all rent repayment details
 */
export function calculateRentRepayment(rentAmount: number, durationDays: 30 | 60 | 90): RentCalculation {
  const accessFee = calculateAccessFee(rentAmount, durationDays);
  const requestFee = calculateRequestFee(rentAmount);
  const totalRepayment = rentAmount + accessFee + requestFee;
  const dailyRepayment = Math.ceil(totalRepayment / durationDays);
  const accessFeeRate = (accessFee / rentAmount) * 100;

  return {
    rentAmount,
    durationDays,
    accessFee,
    requestFee,
    totalRepayment,
    dailyRepayment,
    accessFeeRate
  };
}

/**
 * Calculate agent commission from repayment
 * 5% of rent repaid
 */
export function calculateAgentCommission(repaidAmount: number): number {
  return Math.round(repaidAmount * 0.05);
}

/**
 * Calculate supporter reward
 * 15% of rent facilitation
 */
export function calculateSupporterReward(rentAmount: number): number {
  return Math.round(rentAmount * 0.15);
}

/**
 * Agent approval bonus per approved request
 */
export const AGENT_APPROVAL_BONUS = 5000;

/**
 * Format currency in UGX
 */
export function formatUGX(amount: number): string {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}
