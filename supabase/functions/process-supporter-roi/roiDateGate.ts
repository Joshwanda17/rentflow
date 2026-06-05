/**
 * ROI-cycle date gate for the top-up merge loop.
 *
 * Extracted so it can be unit-tested without importing index.ts (which calls
 * Deno.serve at module load). Mirrors COOPartnersPage.getNextPayoutDate.
 */

/**
 * Date-only "today" in the platform timezone (Africa/Kampala). Returns YYYY-MM-DD.
 * The cron runs in UTC, so we normalise to Kampala to match the COO dashboard.
 */
export function kampalaTodayDateOnly(nowMs?: number): string {
  return new Date(nowMs ?? Date.now()).toLocaleDateString('en-CA', { timeZone: 'Africa/Kampala' });
}

/**
 * Effective next ROI/payout date for a portfolio as a YYYY-MM-DD string.
 *   - When `next_roi_date` is set, that stored date is authoritative (never rolled
 *     forward — a stale/overdue date stays in the past so it reads as "due").
 *   - When it is null, derive from created_at + 1 month on `payout_day`, walking
 *     forward month-by-month until the date is today or later.
 */
export function effectiveNextRoiDateOnly(
  nextRoiDate: string | null,
  createdAt: string,
  payoutDay: number | null,
  nowMs?: number,
): string {
  if (nextRoiDate) return String(nextRoiDate).slice(0, 10);

  const created = new Date(createdAt);
  const day = Math.min((payoutDay || created.getUTCDate()) || 15, 28);
  const todayMs = new Date(kampalaTodayDateOnly(nowMs) + 'T00:00:00Z').getTime();
  let d = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth() + 1, day));
  while (d.getTime() < todayMs) {
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, day));
  }
  return d.toISOString().slice(0, 10);
}

/** True iff the portfolio's effective ROI date is today or in the past. */
export function isPortfolioRoiDue(
  p: { next_roi_date: string | null; created_at: string; payout_day: number | null },
  nowMs?: number,
): boolean {
  return effectiveNextRoiDateOnly(p.next_roi_date, p.created_at, p.payout_day, nowMs)
    <= kampalaTodayDateOnly(nowMs);
}