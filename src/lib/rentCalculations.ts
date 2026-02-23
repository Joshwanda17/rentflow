// Rent calculation utilities for the platform

export interface RentCalculation {
  rentAmount: number;
  durationDays: number;
  accessFee: number;
  requestFee: number;
  totalRepayment: number;
  dailyRepayment: number;
  accessFeeRate: number;
}

// Constants - supported access fee rates
export const ACCESS_FEE_RATES = [
  { rate: 0.23, label: '23%' },
  { rate: 0.28, label: '28%' },
  { rate: 0.33, label: '33%' },
] as const;

const DEFAULT_MONTHLY_COMPOUND_RATE = 0.33; // 33% per month

/**
 * Calculate access fee based on duration and chosen monthly rate
 * Compounding per month, supports any number of days
 */
export function calculateAccessFee(rentAmount: number, durationDays: number, monthlyRate: number = DEFAULT_MONTHLY_COMPOUND_RATE): number {
  const months = durationDays / 30;
  const rate = Math.pow(1 + monthlyRate, months) - 1;
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
 * Supports any duration from 7-120 days
 */
export function calculateRentRepayment(rentAmount: number, durationDays: number, monthlyRate: number = 0.33): RentCalculation {
  const accessFee = calculateAccessFee(rentAmount, durationDays, monthlyRate);
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
 * Calculate instalment amount for a given period
 */
export function calculateInstalment(totalRepayment: number, durationDays: number, periodDays: number): { amount: number; count: number } {
  const count = Math.max(1, Math.ceil(durationDays / periodDays));
  const amount = Math.ceil(totalRepayment / count);
  return { amount, count };
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
