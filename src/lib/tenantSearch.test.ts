import { describe, it, expect } from 'vitest';
import { normalizeName, normalizePhone, phoneVariants, scoreTenantMatch } from './tenantSearch';

describe('normalizeName', () => {
  it('lowercases input', () => {
    expect(normalizeName('John Doe')).toBe('john doe');
  });

  it('strips diacritics', () => {
    expect(normalizeName('José')).toBe('jose');
    expect(normalizeName('Ñoño')).toBe('nono');
  });

  it("collapses punctuation and whitespace", () => {
    expect(normalizeName("O'Brien")).toBe('o brien');
    expect(normalizeName('  John   Doe  ')).toBe('john doe');
    expect(normalizeName('Mary-Anne')).toBe('mary anne');
  });

  it('returns empty for empty / whitespace-only input', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName('   ')).toBe('');
  });

  it('keeps digits inside names', () => {
    expect(normalizeName('Apt 12B')).toBe('apt 12b');
  });
});

describe('normalizePhone', () => {
  it('extracts digits from formatted numbers', () => {
    expect(normalizePhone('0772 123 456')).toBe('772123456');
    expect(normalizePhone('0772-123-456')).toBe('772123456');
    expect(normalizePhone('+256 772 123 456')).toBe('772123456');
    expect(normalizePhone('(0772) 123 456')).toBe('772123456');
  });

  it('strips +256 country code', () => {
    expect(normalizePhone('+256772123456')).toBe('772123456');
    expect(normalizePhone('256772123456')).toBe('772123456');
  });

  it('strips leading 0 only when followed by 9+ digits', () => {
    expect(normalizePhone('0772123456')).toBe('772123456');
    // Short numbers with a leading 0 keep it (not a UG mobile).
    expect(normalizePhone('0123')).toBe('0123');
  });

  it('handles already-normalized 9-digit national numbers', () => {
    expect(normalizePhone('772123456')).toBe('772123456');
  });

  it('returns empty for null / undefined / empty input', () => {
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone('   ')).toBe('');
  });
});

/* ───────── Ranking logic ───────── */

const T = (fullName: string, phone: string | null) => ({ fullName, phone });

describe('scoreTenantMatch — phone queries', () => {
  it('ranks an exact phone match highest (200)', () => {
    const r = scoreTenantMatch('+256 772 123 456', T('Alice', '0772 123 456'));
    expect(r.score).toBe(200);
    expect(r.matchType).toBe('phone');
  });

  it('ranks a phone-prefix match at 150 (national 9-digit form)', () => {
    // Use the national form so both query and candidate normalize to the
    // same starting digits ("772123…"). A leading-0 query like "0772 123"
    // normalizes to "0772123" (leading 0 only stripped at >= 10 digits),
    // which is *not* a prefix of the candidate's "772123456" — that case
    // falls into the mixed-lane prefix branch instead.
    const r = scoreTenantMatch('772 123', T('Alice', '0772 123 456'));
    expect(r.score).toBe(150);
    expect(r.matchType).toBe('phone');
  });

  it('ranks a phone-tail match at 130', () => {
    // Long enough that it's not classified as a "short" 3-4 digit query.
    const r = scoreTenantMatch('123456', T('Alice', '0772 123 456'));
    expect(r.score).toBe(130);
    expect(r.matchType).toBe('phone');
  });

  it('ranks a phone-substring (middle) match at 110', () => {
    const r = scoreTenantMatch('721234', T('Alice', '0772 123 456'));
    expect(r.score).toBe(110);
    expect(r.matchType).toBe('phone');
  });

  it('does not match when phone-y query is absent from the number', () => {
    const r = scoreTenantMatch('999999', T('Alice', '0772 123 456'));
    expect(r.score).toBe(0);
    expect(r.matchType).toBeNull();
  });
});

describe('scoreTenantMatch — short digit queries (3–4 digits)', () => {
  it('matches only the phone tail, not the middle', () => {
    const tail = scoreTenantMatch('3456', T('Alice', '0772 123 456'));
    const middle = scoreTenantMatch('7212', T('Alice', '0772 123 456'));
    expect(tail.matchType).toBe('phone');
    expect(tail.score).toBe(110);
    expect(middle.score).toBe(0); // middle hit suppressed for short queries
  });

  it('matches when the tail matches', () => {
    const r = scoreTenantMatch('456', T('Alice', '0772 123 456'));
    expect(r.matchType).toBe('phone');
  });

  it('falls into the mixed-lane substring score for 2-digit queries', () => {
    // 2 digits → not classified as phone-y (needs >= 3 digits), but the
    // mixed lane still picks up phone substrings at 70 (or 100 if prefix).
    const r = scoreTenantMatch('45', T('Alice', '0772 123 456'));
    expect(r.phoneScore).toBe(70);
    expect(r.matchType).toBe('phone');
  });
});

describe('scoreTenantMatch — name queries', () => {
  it('ranks a full-name prefix at 90', () => {
    const r = scoreTenantMatch('John', T('John Doe', null));
    expect(r.score).toBe(90);
    expect(r.matchType).toBe('name');
  });

  it('ranks a word-prefix (last name) at 80', () => {
    const r = scoreTenantMatch('Doe', T('John Doe', null));
    expect(r.score).toBe(80);
    expect(r.matchType).toBe('name');
  });

  it('ranks a substring (mid-word) match at 50', () => {
    const r = scoreTenantMatch('ohn', T('John Doe', null));
    expect(r.score).toBe(50);
    expect(r.matchType).toBe('name');
  });

  it('matches across diacritics', () => {
    const r = scoreTenantMatch('jose', T('José García', null));
    expect(r.matchType).toBe('name');
    expect(r.score).toBeGreaterThan(0);
  });

  it('treats apostrophes as a word break (current behaviour)', () => {
    // "O'Brien" normalizes to "o brien" so a glued query "obrien" does NOT
    // match. Searching by either token does — this test pins down the
    // intended trade-off so any future change is intentional.
    const glued = scoreTenantMatch('obrien', T("O'Brien", null));
    expect(glued.score).toBe(0);
    const surname = scoreTenantMatch('brien', T("O'Brien", null));
    expect(surname.matchType).toBe('name');
    expect(surname.score).toBeGreaterThan(0);
  });
});

describe('scoreTenantMatch — mixed queries (digits + letters)', () => {
  it('treats sub-3-digit query as not phone-y (no phone score)', () => {
    // "07x" → phone digits "07" (length 2). Below the 3-digit floor, so no
    // phone score is awarded in either lane. Name lane sees "07 x" which
    // also doesn't match "alice".
    const r = scoreTenantMatch('07x', T('Alice', '0772 123 456'));
    expect(r.phoneScore).toBe(0);
    expect(r.score).toBe(0);
  });

  it('mixed-lane phone-prefix scores 100 when query digits start the phone', () => {
    // National form so the digit prefix lines up with the candidate's
    // normalized phone ("772123456"). The letter in the query disqualifies
    // it from the pure phone-y lane, so it falls into the mixed lane
    // (prefix → 100).
    const r = scoreTenantMatch('772 hello', T('Alice', '0772 123 456'));
    expect(r.phoneScore).toBe(100);
  });

  it('returns the higher-scoring lane when both phone and name match', () => {
    // Tenant name literally starts with the digits we'll search by, AND the
    // candidate phone prefixes the same digits → both lanes light up.
    // Phone (prefix, 150) > name (prefix, 90), so matchType resolves to phone.
    const r = scoreTenantMatch('772 1234', T('772 1234 Apartments', '0772 123 456'));
    expect(r.phoneScore).toBeGreaterThan(0);
    expect(r.nameScore).toBeGreaterThan(0);
    expect(r.matchType).toBe('phone');
  });

  it('matchType reflects whichever lane scored', () => {
    const onlyName = scoreTenantMatch('Alice', T('Alice', '0772 123 456'));
    expect(onlyName.matchType).toBe('name');
    const onlyPhone = scoreTenantMatch('772 123', T('Bob', '0772 123 456'));
    expect(onlyPhone.matchType).toBe('phone');
  });
});

describe('scoreTenantMatch — empty and edge cases', () => {
  it('empty query yields no match', () => {
    const r = scoreTenantMatch('', T('Alice', '0772 123 456'));
    expect(r.score).toBe(0);
    expect(r.matchType).toBeNull();
  });

  it('whitespace-only query yields no match', () => {
    const r = scoreTenantMatch('   ', T('Alice', '0772 123 456'));
    expect(r.score).toBe(0);
  });

  it('candidate with no phone still matches by name', () => {
    const r = scoreTenantMatch('Alice', T('Alice', null));
    expect(r.score).toBe(90);
    expect(r.matchType).toBe('name');
  });

  it('candidate with no phone never matches phone-y queries', () => {
    const r = scoreTenantMatch('77212', T('Alice', null));
    expect(r.score).toBe(0);
  });
});

describe('normalizePhone — messy fallbacks', () => {
  it('handles 00 international trunk prefix', () => {
    expect(normalizePhone('00256772123456')).toBe('772123456');
  });

  it('handles double leading zeros', () => {
    expect(normalizePhone('00772123456')).toBe('772123456');
    expect(normalizePhone('000772123456')).toBe('772123456');
  });

  it('handles mixed whitespace, dashes, parens, and plus', () => {
    expect(normalizePhone(' + 256 (0) 772-123-456 ')).toBe('772123456');
  });
});

describe('phoneVariants', () => {
  it('returns canonical national form among variants', () => {
    expect(phoneVariants('0772 123 456')).toContain('772123456');
  });

  it('exposes raw and tail forms for messy +256 inputs', () => {
    const v = phoneVariants('+2560772123456');
    expect(v).toContain('772123456');
  });

  it('returns empty array for empty input', () => {
    expect(phoneVariants('')).toEqual([]);
    expect(phoneVariants(null)).toEqual([]);
  });

  it('handles 00 trunk prefix', () => {
    const v = phoneVariants('00256 772 123 456');
    expect(v).toContain('772123456');
  });
});

describe('scoreTenantMatch — fuzzy phone fallback', () => {
  it('flags bestMatchFallback for messy +256 0 772 input', () => {
    // Strict normalizePhone of "+256 0 772 123 456" yields "772123456"
    // already, so this should NOT need the fallback.
    const strict = scoreTenantMatch('+256 0 772 123 456', T('Alice', '0772 123 456'));
    expect(strict.bestMatchFallback ?? false).toBe(false);
    expect(strict.score).toBeGreaterThan(0);
  });

  it('matches via fallback when strict normalization differs', () => {
    // Pad the query with an unusual extra prefix that strict normalize won't
    // strip, but phoneVariants will produce a tail equal to the candidate.
    const r = scoreTenantMatch('99 256 772 123 456', T('Alice', '0772 123 456'));
    expect(r.score).toBeGreaterThan(0);
    expect(r.bestMatchFallback).toBe(true);
    expect(r.matchType).toBe('phone');
  });

  it('does not flag fallback for pure name matches', () => {
    const r = scoreTenantMatch('Alice', T('Alice', '0772 123 456'));
    expect(r.bestMatchFallback ?? false).toBe(false);
  });
});
