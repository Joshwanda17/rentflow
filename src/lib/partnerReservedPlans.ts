import { supabase } from '@/integrations/supabase/client';

/**
 * Rent plans a partner has reserved or already funded (self-managed funding).
 *
 * The company/CFO landlord-float route must never touch these — a DB trigger
 * (`trg_guard_partner_reserved_float_allocation`) is the hard fence; this helper
 * keeps them out of the funding queues so operators never see a plan they cannot
 * fund. Deliberately returns IDs only: the partner's identity is never exposed.
 *
 * One round trip for the whole page (no N+1).
 */
export async function fetchPartnerReservedPlanIds(
  rentRequestIds: string[],
): Promise<Set<string>> {
  if (!rentRequestIds.length) return new Set();
  const { data, error } = await supabase.rpc('psm_reserved_plan_ids' as any, {
    p_rent_request_ids: rentRequestIds,
  });
  if (error) {
    // Fail closed is wrong here (it would empty the queue); the DB trigger still
    // blocks any double funding, so fall back to showing everything.
    console.warn('[partnerReservedPlans] lookup failed:', error.message);
    return new Set();
  }
  return new Set(((data ?? []) as any[]).map((r) => r.rent_request_id as string));
}

/** Drops partner-reserved plans from a list of rent-request-shaped rows. */
export async function excludePartnerReservedPlans<T extends { id: string }>(
  rows: T[],
): Promise<T[]> {
  const reserved = await fetchPartnerReservedPlanIds(rows.map((r) => r.id));
  return reserved.size ? rows.filter((r) => !reserved.has(r.id)) : rows;
}
