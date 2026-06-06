/**
 * Mission Board empty-house projection helpers.
 *
 * These pure functions mirror the projection maths used by:
 *   • the `welile_mission_receivables` RPC (summary "Est. full potential")
 *   • the per-row rent estimate in the Empty Houses dialog
 *
 * The critical invariant they protect:  a projection must NEVER collapse to
 * UGX 0 just because a narrow time window (2 / 7 / 30 days) happens to contain
 * no house with a recorded rent. When the in-window sample is empty we fall
 * back to the platform-wide ("global") average so the projection still surfaces
 * a meaningful figure.
 */

/** Welile rent → annual receivable markup: rent + 33% fee, projected over 12 months. */
export const ANNUAL_PROJECTION_MARKUP = 1.33;

export interface ProjectableHouse {
  monthly_rent?: number | null;
  number_of_rooms?: number | null;
}

/** Annual projected receivable for a single house given its monthly rent. */
export function projectAnnualReceivable(monthlyRent: number): number {
  const rent = Number(monthlyRent) || 0;
  if (rent <= 0) return 0;
  // ((rent + 33%) / 30) * 30 * 12 === rent * 1.33 * 12
  return ((rent * ANNUAL_PROJECTION_MARKUP) / 30) * 30 * 12;
}

export interface RentEstimator {
  avgOverall: number;
  avgPerRoom: number;
  knownCount: number;
  /** Estimated monthly rent for a house with no recorded rent. */
  estimateFor: (house: ProjectableHouse) => number;
}

/**
 * Build a per-house monthly-rent estimator.
 *
 * @param houses           Houses currently loaded for the active window.
 * @param globalAvgMonthly Platform-wide average known monthly rent (window
 *                         independent). Used as the fallback whenever the
 *                         in-window sample has no recorded rents.
 */
export function buildRentEstimator(
  houses: ProjectableHouse[],
  globalAvgMonthly: number,
): RentEstimator {
  let perRoomSum = 0,
    perRoomCount = 0,
    knownSum = 0,
    knownCount = 0;

  for (const h of houses) {
    const rent = Number(h.monthly_rent) || 0;
    if (rent <= 0) continue;
    knownSum += rent;
    knownCount += 1;
    const rooms = Number(h.number_of_rooms) || 0;
    if (rooms > 0) {
      perRoomSum += rent / rooms;
      perRoomCount += 1;
    }
  }

  const globalAvg = Math.max(0, Math.round(Number(globalAvgMonthly) || 0));
  // Prefer the in-window average; fall back to the platform-wide average so
  // narrow windows still project instead of collapsing to UGX 0.
  const avgOverall = knownCount > 0 ? Math.round(knownSum / knownCount) : globalAvg;
  const avgPerRoom = perRoomCount > 0 ? Math.round(perRoomSum / perRoomCount) : 0;

  const estimateFor = (house: ProjectableHouse): number => {
    const rooms = Number(house.number_of_rooms) || 0;
    if (rooms > 0 && avgPerRoom > 0) return Math.round(rooms * avgPerRoom);
    return avgOverall;
  };

  return { avgOverall, avgPerRoom, knownCount, estimateFor };
}

export interface FullProjectionInputs {
  /** Annual projection summed over in-window houses that DO have a recorded rent. */
  knownTotal: number;
  /** Count of in-window houses with NO recorded rent. */
  missingCount: number;
  /** Platform-wide average known monthly rent (window independent). */
  avgKnownMonthly: number;
}

/**
 * Total "Est. full potential" annual projection — mirrors the RPC:
 *   known_total + missing_count * (avg_known_monthly * 1.33 * 12)
 */
export function projectFullPotential({
  knownTotal,
  missingCount,
  avgKnownMonthly,
}: FullProjectionInputs): number {
  const known = Math.max(0, Number(knownTotal) || 0);
  const missing = Math.max(0, Number(missingCount) || 0);
  return known + missing * projectAnnualReceivable(Number(avgKnownMonthly) || 0);
}
