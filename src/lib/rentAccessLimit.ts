/**
 * Rent Access Limit
 *
 * Formula (per business decision):
 *   limit = clamp(0,  +UGX 10,000 × on-time-payment days
 *                     −UGX  7,000 × missed days,
 *                  UGX 30,000,000)
 *
 * - Every tenant qualifies from day 0 — no minimum-payments threshold.
 * - "Day" is a calendar day in the tenant's tracked window
 *   (first repayment date → today, inclusive). If there's no
 *   repayment yet, no daily adjustments apply.
 * - Multiple payments on the same day count as ONE on-time day.
 * - Hard cap: UGX 30,000,000. Floor: 0.
 * - Pure function — no DB writes, recomputed on the fly.
 */

export interface RepaymentLike {
  amount: number;
  created_at: string; // ISO date
}

export interface RentAccessLimitResult {
  /** Final limit in UGX */
  limit: number;
  /** Reference base (monthly_rent × 12) — kept for legacy share artefacts; not used in limit math */
  base: number;
  /** Progress toward the max cap, 0..1 (limit / MAX_LIMIT) */
  netAdjustmentPct: number;
  /** How many days had at least one on-time payment */
  paidDays: number;
  /** How many days were missed (in the tracked window) */
  missedDays: number;
  /** Total tracked days */
  trackedDays: number;
  /** Today's net change in UGX (for the "today" pill): +10,000 if paid today, otherwise −7,000 */
  todayChange: number;
  /** Repayment was logged today */
  paidToday: boolean;
  /** Days remaining until next bump (always 1 if not paid today, 0 if paid today) */
  nextChangeDays: number;
  /** Tier label based on progress toward the max cap */
  tier: 'starter' | 'rising' | 'trusted' | 'elite';
  /** Hit the max cap */
  atMax: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const RENT_ACCESS_PAID_INCREMENT_UGX = 10_000;
export const RENT_ACCESS_MISSED_DECREMENT_UGX = 7_000;
export const RENT_ACCESS_MAX_LIMIT_UGX = 30_000_000;

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

  const rawLimit =
    paidDays * RENT_ACCESS_PAID_INCREMENT_UGX -
    missedDays * RENT_ACCESS_MISSED_DECREMENT_UGX;
  const limit = Math.max(0, Math.min(RENT_ACCESS_MAX_LIMIT_UGX, rawLimit));
  const atMax = limit >= RENT_ACCESS_MAX_LIMIT_UGX;

  const netAdjustmentPct = limit / RENT_ACCESS_MAX_LIMIT_UGX;

  const paidToday = paidDaySet.has(todayKey);
  const todayChange = paidToday
    ? RENT_ACCESS_PAID_INCREMENT_UGX
    : -RENT_ACCESS_MISSED_DECREMENT_UGX;

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
    atMax,
  };
}

export const TIER_META: Record<RentAccessLimitResult['tier'], { label: string; color: string; emoji: string }> = {
  starter:  { label: 'Starter',  color: 'text-muted-foreground', emoji: '🌱' },
  rising:   { label: 'Rising',   color: 'text-primary',          emoji: '🚀' },
  trusted:  { label: 'Trusted',  color: 'text-success',          emoji: '⭐' },
  elite:    { label: 'Elite',    color: 'text-warning',          emoji: '👑' },
};
