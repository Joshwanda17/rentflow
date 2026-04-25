/**
 * Pure utilities behind the agent tenant picker (FieldCollectDialog).
 *
 * Extracted into a standalone module so they can be unit-tested without
 * dragging React, Supabase, or the rest of the dialog into the test runner.
 *
 * Public API:
 *   - normalizeName(s)
 *   - normalizePhone(raw)
 *   - scoreTenantMatch(rawQuery, candidate)  — returns the same shape used by the
 *     dialog's filter memo so tests can assert ranking + match-type behaviour.
 */

/**
 * Normalize a name for fuzzy matching:
 *   - lowercase
 *   - strip diacritics (é → e)
 *   - collapse anything that isn't a letter/number/space into a single space
 *
 * Lets "O'Brien", "obrien", and "o brien" all match the same way.
 */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a Ugandan phone number to its national 9-digit form so that
 * "+256 772 123 456", "0772-123456", "0772 123 456" and "772123456" all
 * collapse to "772123456" for comparison. Returns the digits-only fallback
 * for non-UG numbers.
 *
 * Tolerates messy inputs:
 *   - extra leading zeros ("00772…", "000256…")
 *   - country code without `+` ("256772…")
 *   - international "00" trunk prefix ("00256772…")
 *   - whitespace, dashes, parens, plus signs anywhere
 */
export function normalizePhone(raw: string | null | undefined): string {
  let digits = (raw || '').replace(/\D+/g, '');
  if (!digits) return '';
  // International "00" trunk prefix → "+", e.g. "00256…" or "00044…"
  if (digits.startsWith('00')) digits = digits.slice(2);
  // Collapse runs of leading zeros down to a single zero so "00772…" → "0772…"
  // and "000772…" → "0772…" still normalize correctly.
  if (digits.startsWith('0')) digits = '0' + digits.replace(/^0+/, '');
  // Strip the country code, then re-collapse a leading national "0" so that
  // inputs like "+256 0 772…" (digits "2560772…") still land on "772…".
  if (digits.startsWith('256')) digits = digits.slice(3);
  if (digits.startsWith('0') && digits.length >= 10) digits = digits.slice(1);
  // Some users type the national 9-digit form with a stray country-code-like
  // prefix that wasn't "256" — in that case fall through and return as-is.
  return digits;
}

/**
 * Generate equivalent phone forms to try when strict `normalizePhone` doesn't
 * land on the canonical 9-digit national number. Used as a fuzzy fallback so
 * messy inputs like "+2560772 123 456", "0256 772…", or "+256-0-772…" still
 * find the right tenant.
 */
export function phoneVariants(raw: string | null | undefined): string[] {
  const out = new Set<string>();
  const base = normalizePhone(raw);
  if (base) out.add(base);

  const digits = (raw || '').replace(/\D+/g, '');
  if (!digits) return [...out];

  // Try chopping every common prefix combination.
  const candidates = new Set<string>([digits]);
  // 00-trunk
  if (digits.startsWith('00')) candidates.add(digits.slice(2));
  // 256 country code
  if (digits.startsWith('256')) candidates.add(digits.slice(3));
  // 2560… variants ("+256 0 772…")
  if (digits.startsWith('2560')) candidates.add(digits.slice(4));
  // 00256… variants
  if (digits.startsWith('00256')) candidates.add(digits.slice(5));
  // Leading zero(s)
  candidates.add(digits.replace(/^0+/, ''));

  for (const c of candidates) {
    if (c) out.add(c);
    // Also try the last 9 digits (canonical UG national length) as a
    // last-resort tail extraction.
    if (c.length > 9) out.add(c.slice(-9));
  }
  return [...out].filter(Boolean);
}

/**
 * Explicit last-N-digits matcher. Returns metadata about a tail comparison
 * between a candidate phone (already normalized to digits) and the query
 * digits — primarily used by the dialog's short-phone-query path so we can
 * a) make the tail length explicit (3-digit query → tail-3, 4-digit → tail-4)
 * and b) boost ranking when the tail aligns to a phone "block boundary" the
 * agent is likely thinking in (e.g. the last 3-digit hyphen group).
 *
 * Returns null when the candidate phone doesn't end in the query digits.
 * Otherwise returns:
 *   - tailLen   how many digits were compared (= query length)
 *   - boundary  true when the digit immediately before the matched tail
 *               sits on a 3-digit phone block boundary (UG numbers are
 *               written 077X-XXX-XXX, so positions 4 and 7 from the left
 *               are natural "where the agent stops typing" cuts). Used as a
 *               small ranking nudge.
 */
export function tailMatch(
  phone: string,
  queryDigits: string,
): { tailLen: number; boundary: boolean } | null {
  if (!phone || !queryDigits) return null;
  if (!phone.endsWith(queryDigits)) return null;
  const tailLen = queryDigits.length;
  // For a UG national number "772XXXYYYY" (length 9–10) the natural blocks
  // are 3-3-3. Treat tails of length 3, 4, 6, or 7 as "block aligned" — these
  // are the chunks an agent typically dictates when calling out the last few
  // digits ("…-456", "…-3-456", "…-345 678").
  const boundary = tailLen === 3 || tailLen === 4 || tailLen === 6 || tailLen === 7;
  return { tailLen, boundary };
}

/**
 * Given the full set of candidate phones surviving a tail-N short-query
 * match, return a Map of phone → "shared count" (how many candidates share
 * the same tail). Drives the uniqueness ranking nudge: a tenant whose tail
 * is unique in the result set ranks above one where 5 tenants share it.
 *
 * Pure / side-effect-free so it can be unit-tested without React.
 */
export function tailSharedCounts(
  phones: ReadonlyArray<string>,
  queryDigits: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (!queryDigits) return counts;
  // Bucket every candidate by its "tail signature" — for our purposes the
  // signature IS the query digits (everyone in the bucket ends with them).
  // We additionally key by the digit immediately before the tail so two
  // tenants with phones "0772123456" and "0712123456" both ending in "456"
  // count as sharing the bucket but a tenant ending in just "56" doesn't.
  for (const p of phones) {
    if (!p || !p.endsWith(queryDigits)) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  // Now collapse: every candidate that ends with the same `queryDigits`
  // shares the bucket. (We don't sub-segment further — the agent just typed
  // those N digits; that's the visible ambiguity the UI needs to surface.)
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  for (const k of counts.keys()) counts.set(k, total);
  return counts;
}

/**
 * Decide whether a short (3–4 digit) phone query's results should be
 * suppressed to force the agent to type more digits. Mirrors the safety
 * branch in `FieldCollectDialog`'s filter memo so it can be unit-tested.
 *
 * Rule: when the query is short and digit-only, AND the result set has
 * exactly one phone-only match (no name overlap), return an empty array.
 * That single match is too risky to auto-pick — the empty list triggers the
 * "type more digits" hint + "Search by name instead" button in the UI.
 *
 * Pass-through in every other case (longer query, multiple matches, any
 * name overlap, non-phone query).
 */
export function applyShortQuerySuppression<T extends { matchType: MatchType }>(
  rawQuery: string,
  scored: ReadonlyArray<T>,
): T[] {
  const raw = rawQuery.trim();
  const phoneQ = normalizePhone(raw);
  const stripped = raw.replace(/[\s\-+()]/g, '');
  const isPhoneQuery =
    phoneQ.length >= 3 &&
    /\d/.test(raw) &&
    stripped.replace(/\D+/g, '').length >= stripped.length - 1;
  const isShortPhoneQuery = isPhoneQuery && phoneQ.length >= 3 && phoneQ.length <= 4;
  if (!isShortPhoneQuery) return [...scored];

  const phoneOnly = scored.filter(s => s.matchType === 'phone');
  const nameAny = scored.filter(s => s.matchType === 'name' || s.matchType === 'both');
  if (phoneOnly.length === 1 && nameAny.length === 0) return [];
  return [...scored];
}

export type MatchType = 'phone' | 'name' | 'both' | null;

export interface TenantMatchInput {
  fullName: string;
  phone: string | null | undefined;
}

export interface TenantMatchResult {
  score: number;
  matchType: MatchType;
  phoneScore: number;
  nameScore: number;
  /**
   * True when the phone match was found only via the fuzzy variants
   * fallback (i.e. strict normalization didn't produce a hit). Drives the
   * "Best match" chip in the UI so the agent knows we relaxed the rules.
   */
  bestMatchFallback?: boolean;
}

/**
 * Compute a rank score + which lane (phone/name/both) drove the match for a
 * single tenant against a raw search query. Mirrors the inline scoring used by
 * `FieldCollectDialog`'s filter memo so we can unit-test it in isolation.
 *
 * Scoring lanes (higher wins):
 *   Phone (when query is digit-y)
 *     200  exact full phone match
 *     150  phone starts with query
 *     130  phone ends with query (tail match)
 *     110  phone contains query somewhere
 *   Phone (mixed alphanumeric query)
 *     100  phone starts with query digits
 *      70  phone contains query digits
 *   Name
 *      90  name starts with query
 *      80  any word in name starts with query
 *      50  name contains query somewhere
 *
 * Short phone queries (3–4 digits) intentionally only match the phone tail to
 * avoid noisy "anywhere" hits the agent would have to disambiguate.
 */
export function scoreTenantMatch(rawQuery: string, candidate: TenantMatchInput): TenantMatchResult {
  const raw = rawQuery.trim();
  const q = normalizeName(raw);
  const phoneQ = normalizePhone(raw);
  const phone = normalizePhone(candidate.phone);
  const name = normalizeName(candidate.fullName);
  const nameWords = name.split(' ').filter(Boolean);

  // Treat the query as "phone-y" if the user typed mostly digits — even with
  // spaces, dashes, plus signs or a leading 0/256.
  const stripped = raw.replace(/[\s\-+()]/g, '');
  const isPhoneQuery =
    phoneQ.length >= 3 &&
    /\d/.test(raw) &&
    stripped.replace(/\D+/g, '').length >= stripped.length - 1;
  const isShortPhoneQuery = isPhoneQuery && phoneQ.length >= 3 && phoneQ.length <= 4;

  let phoneScore = 0;
  let nameScore = 0;
  let bestMatchFallback = false;

  if (isShortPhoneQuery && phone) {
    // Use the explicit tail-N matcher so 3-digit queries become tail-3
    // matches and 4-digit queries tail-4. Boundary-aligned tails get a
    // small +5 bonus (matches the dialog scorer; uniqueness ranking lives
    // in the dialog because it needs the full candidate set).
    const tm = tailMatch(phone, phoneQ);
    if (tm) phoneScore = 110 + (tm.boundary ? 5 : 0);
  } else if (isPhoneQuery && phone && phone.includes(phoneQ)) {
    if (phone === phoneQ) phoneScore = 200;
    else if (phone.startsWith(phoneQ)) phoneScore = 150;
    else if (phone.endsWith(phoneQ)) phoneScore = 130;
    else phoneScore = 110;
  } else if (phoneQ && phone && phone.includes(phoneQ)) {
    phoneScore = phone.startsWith(phoneQ) ? 100 : 70;
  }

  // Fuzzy fallback: strict normalization didn't find a phone hit, but the
  // raw query still contains digits. Try every equivalent form and the last
  // 6+ digits of the candidate so messy inputs (extra zeros, weird country
  // code prefixes) still land on the right tenant.
  if (phoneScore === 0 && phone && /\d/.test(raw)) {
    const variants = phoneVariants(raw).filter(v => v.length >= 4);
    for (const v of variants) {
      if (phone === v) { phoneScore = 60; bestMatchFallback = true; break; }
      if (phone.endsWith(v) && v.length >= 6) { phoneScore = 55; bestMatchFallback = true; break; }
      if (phone.includes(v) && v.length >= 7) { phoneScore = 50; bestMatchFallback = true; break; }
    }
  }

  if (q) {
    if (name.startsWith(q)) nameScore = 90;
    else if (nameWords.some(w => w.startsWith(q))) nameScore = 80;
    else if (name.includes(q)) nameScore = 50;
  }

  const score = Math.max(phoneScore, nameScore);
  let matchType: MatchType = null;
  if (phoneScore > 0 && nameScore > 0 && phoneScore === nameScore) matchType = 'both';
  else if (phoneScore > nameScore) matchType = 'phone';
  else if (nameScore > 0) matchType = 'name';

  return { score, matchType, phoneScore, nameScore, bestMatchFallback };
}

/**
 * Stable, fast fingerprint of a tenant list for cache-key purposes.
 *
 * Encodes (id, fullName, phone) for every tenant so the persisted normalized
 * index is invalidated whenever any of those source values change — but stays
 * valid across reloads when the list is unchanged. Uses a tiny non-crypto
 * 32-bit FNV-1a hash so we can fingerprint thousands of rows synchronously.
 */
export function tenantListFingerprint(
  tenants: ReadonlyArray<{ tenantId: string; fullName: string; phone: string | null }>,
): string {
  // Sort by tenantId so list-ordering changes alone don't bust the cache.
  const sorted = [...tenants].sort((a, b) => (a.tenantId < b.tenantId ? -1 : a.tenantId > b.tenantId ? 1 : 0));
  let h = 0x811c9dc5;
  for (const t of sorted) {
    const s = `${t.tenantId}|${t.fullName}|${t.phone ?? ''}\n`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  // Include length so empty/non-empty lists never collide on h=offset basis.
  return `${sorted.length}-${(h >>> 0).toString(16)}`;
}
