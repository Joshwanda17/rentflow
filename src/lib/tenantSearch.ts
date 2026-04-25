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
 */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.startsWith('256')) return digits.slice(3);
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(1);
  return digits;
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

  if (isShortPhoneQuery && phone) {
    if (phone.endsWith(phoneQ)) phoneScore = 110;
  } else if (isPhoneQuery && phone && phone.includes(phoneQ)) {
    if (phone === phoneQ) phoneScore = 200;
    else if (phone.startsWith(phoneQ)) phoneScore = 150;
    else if (phone.endsWith(phoneQ)) phoneScore = 130;
    else phoneScore = 110;
  } else if (phoneQ && phone && phone.includes(phoneQ)) {
    phoneScore = phone.startsWith(phoneQ) ? 100 : 70;
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

  return { score, matchType, phoneScore, nameScore };
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
