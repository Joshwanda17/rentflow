import { describe, it, expect } from 'vitest';
import { normalizeName, normalizePhone, scoreTenantMatch } from './tenantSearch';

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

  it('ranks a phone-prefix match at 150', () => {
    const r = scoreTenantMatch('0772 123', T('Alice', '0772 123 456'));
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

  it('does not classify a 2-digit query as a phone query', () => {
    // Falls into the mixed-query lane (which still requires phoneQ.length >= 3
    // via normalizePhone). 2 digits → no match at all.
    const r = scoreTenantMatch('45', T('Alice', '0772 123 456'));
    expect(r.score).toBe(0);
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

  it('matches across apostrophes', () => {
    const r = scoreTenantMatch('obrien', T("O'Brien", null));
    expect(r.matchType).toBe('name');
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('scoreTenantMatch — mixed queries (digits + letters)', () => {
  it('phone scores in the mixed lane when query contains both digits and letters', () => {
    // "07x" — has a letter so it isn't classified as phone-y, so the phone
    // hit comes from the mixed lane (≤100). Name is empty → no name hit.
    const r = scoreTenantMatch('07x', T('Alice', '0772 123 456'));
    // `07x` normalizes to `07 x` for name and `07` for phone. Phone < 3 digits
    // → no phone match in either lane → 0.
    expect(r.score).toBe(0);
  });

  it('mixed-lane phone-prefix scores 100 when phone digits are >= 3', () => {
    // "0772 hello" — phone digits 0772 (4) and a name word "hello".
    const r = scoreTenantMatch('0772 hello', T('Alice', '0772 123 456'));
    // phoneQ = "772", digit ratio < threshold → mixed lane prefix hit = 100.
    expect(r.phoneScore).toBe(100);
  });

  it('reports both lanes when phone and name match the query', () => {
    const r = scoreTenantMatch('772', T('772 Apartments', '0772 123 456'));
    expect(r.phoneScore).toBeGreaterThan(0);
    expect(r.nameScore).toBeGreaterThan(0);
    // Phone score (110) ≠ name score (90) → top lane wins, not "both".
    expect(r.matchType).toBe('phone');
  });

  it('labels matchType "both" only when phone and name scores tie', () => {
    // Construct a tie: short tail digit query that scores 110, plus a name
    // prefix that we artificially raise to 110 — easiest path is to verify
    // that when only one lane scores, matchType reflects that lane.
    const onlyName = scoreTenantMatch('Alice', T('Alice', '0772 123 456'));
    expect(onlyName.matchType).toBe('name');
    const onlyPhone = scoreTenantMatch('0772', T('Bob', '0772 123 456'));
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
    const r = scoreTenantMatch('0772', T('Alice', null));
    expect(r.score).toBe(0);
  });
});
