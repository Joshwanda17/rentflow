/**
 * Rent Access Limit
 *
 * Formula (per business decision):
 *   base       = monthly_rent × 12
 *   adjustment = +5% × on-time-payment days  −  5% × missed days
 *   limit      = max(0, base + adjustment × base)
 *
 * - "Day" is a calendar day in the tenant's tracked window
 *   (first repayment date → today, inclusive). If there's no
 *   repayment yet, no daily adjustments apply.
 * - Multiple payments on the same day count as ONE on-time day.
 * - No upper or lower cap (per user choice). We only floor at 0.
 * - Pure function — no DB writes, recomputed on the fly.
 */

export interface RepaymentLike {
  amount: number;
  created_at: string; // ISO date
}

export interface RentAccessLimitResult {
  /** Final limit in UGX */
  limit: number;
  /** Base = monthly_rent × 12 */
  base: number;
  /** Net % adjustment applied to the base (e.g. 0.15 = +15%) */
  netAdjustmentPct: number;
  /** How many days had at least one on-time payment */
  paidDays: number;
  /** How many days were missed (in the tracked window) */
  missedDays: number;
  /** Total tracked days */
  trackedDays: number;
  /** Today's net change in UGX (for the "today" pill) */
  todayChange: number;
  /** Repayment was logged today */
  paidToday: boolean;
  /** Days remaining until next +5% (always 1 if not paid today, 0 if paid today) */
  nextChangeDays: number;
  /** Tier label based on net adjustment */
  tier: 'starter' | 'rising' | 'trusted' | 'elite';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PER_DAY = 0.05;

function startOfDayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function calculateRentAccessLimit(
  monthlyRent: number | null | undefined,
  repayments: RepaymentLike[] | null | undefined,
  now: Date = new Date(),
): RentAccessLimitResult {
  const rent = Math.max(0, Number(monthlyRent) || 0);
  const base = rent * 12;

  const valid = (repayments || []).filter(r => Number(r.amount) > 0 && r.created_at);

  const paidDaySet = new Set<number>();
  for (const r of valid) {
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) continue;
    paidDaySet.add(startOfDayUtc(d));
  }

  const todayKey = startOfDayUtc(now);
  let trackedDays = 0;
  if (paidDaySet.size > 0) {
    const firstKey = Math.min(...paidDaySet);
    trackedDays = Math.max(1, Math.floor((todayKey - firstKey) / DAY_MS) + 1);
  }

  const paidDays = paidDaySet.size;
  const missedDays = Math.max(0, trackedDays - paidDays);

  const netAdjustmentPct = (paidDays - missedDays) * PER_DAY;
  const limit = Math.max(0, base * (1 + netAdjustmentPct));

  const paidToday = paidDaySet.has(todayKey);
  const todayChange = paidToday ? base * PER_DAY : -base * PER_DAY;

  let tier: RentAccessLimitResult['tier'] = 'starter';
  if (netAdjustmentPct >= 0.5) tier = 'elite';
  else if (netAdjustmentPct >= 0.2) tier = 'trusted';
  else if (netAdjustmentPct >= 0.05) tier = 'rising';

  return {
    limit,
    base,
    netAdjustmentPct,
    paidDays,
    missedDays,
    trackedDays,
    todayChange,
    paidToday,
    nextChangeDays: paidToday ? 0 : 1,
    tier,
  };
}

export const TIER_META: Record<RentAccessLimitResult['tier'], { label: string; color: string; emoji: string }> = {
  starter:  { label: 'Starter',  color: 'text-muted-foreground', emoji: '🌱' },
  rising:   { label: 'Rising',   color: 'text-primary',          emoji: '🚀' },
  trusted:  { label: 'Trusted',  color: 'text-success',          emoji: '⭐' },
  elite:    { label: 'Elite',    color: 'text-warning',          emoji: '👑' },
};
