/**
 * Funder direct-support earnings projection.
 *
 * A funder who supports a tenant moving into a house earns 15% per month of
 * that house's monthly rent. Everything else (daily / weekly / 12-month) is
 * derived from that single monthly figure.
 */

export const FUNDER_MONTHLY_RATE = 0.15;

export interface FunderEarnings {
  /** Capital required — the house's monthly rent. */
  capital: number;
  monthly: number;
  weekly: number;
  daily: number;
  /** Projected total over the next 12 months. */
  annual: number;
}

function safe(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function calcFunderEarnings(monthlyRent: number): FunderEarnings {
  const capital = safe(monthlyRent);
  const monthly = Math.round(capital * FUNDER_MONTHLY_RATE);
  return {
    capital,
    monthly,
    weekly: Math.round((monthly * 12) / 52),
    daily: Math.round((monthly * 12) / 365),
    annual: monthly * 12,
  };
}

export function sumFunderEarnings(rents: number[]): FunderEarnings {
  return rents.reduce<FunderEarnings>(
    (acc, rent) => {
      const e = calcFunderEarnings(rent);
      return {
        capital: acc.capital + e.capital,
        monthly: acc.monthly + e.monthly,
        weekly: acc.weekly + e.weekly,
        daily: acc.daily + e.daily,
        annual: acc.annual + e.annual,
      };
    },
    { capital: 0, monthly: 0, weekly: 0, daily: 0, annual: 0 },
  );
}
