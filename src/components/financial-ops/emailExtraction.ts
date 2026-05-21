/**
 * Pure extraction helpers for the Gmail transaction email pipeline.
 * Lifted out of `EmailTransactionsPanel.tsx` so they can be unit-tested
 * against real MTN / Airtel / Equity Bank email shapes without pulling
 * in the whole React component.
 */

export interface EmailRowLike {
  from_email?: string | null;
  from_name?: string | null;
  subject?: string | null;
  snippet?: string | null;
  counterparty?: string | null;
  transaction_id?: string | null;
}

/**
 * Normalize Ugandan-style phone numbers to the canonical `256XXXXXXXXX`
 * (12-digit) form so the lookup hits regardless of whether the email
 * printed "+256…", "0772…", or "256772…".
 */
export function normalizeUgPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 9 && digits.startsWith('7')) return `256${digits}`;
  if (digits.length === 10 && digits.startsWith('07')) return `256${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('256')) return digits;
  if (digits.length === 13 && digits.startsWith('2560')) return `256${digits.slice(4)}`;
  return null;
}

/** Pull every plausible Uganda mobile number out of the email row. */
export function extractPhones(r: EmailRowLike): string[] {
  const hay = `${r.from_email ?? ''} ${r.from_name ?? ''} ${r.subject ?? ''} ${r.snippet ?? ''} ${r.counterparty ?? ''} ${r.transaction_id ?? ''}`;
  const out = new Set<string>();
  const re = /(?:\+?256|0)\s*7\d{2}[\s-]?\d{3}[\s-]?\d{3}/g;
  const matches = hay.match(re) ?? [];
  for (const m of matches) {
    const norm = normalizeUgPhone(m);
    if (norm) out.add(norm);
  }
  return Array.from(out);
}

/** Phones that appear immediately after the word "from" (deposit sender). */
export function extractFromPhones(r: EmailRowLike): string[] {
  const hay = `${r.subject ?? ''} ${r.snippet ?? ''} ${r.counterparty ?? ''}`;
  const out = new Set<string>();
  const re = /\bfrom\s+(?:\+?256|0)\s*7\d{2}[\s-]?\d{3}[\s-]?\d{3}/gi;
  const matches = hay.match(re) ?? [];
  for (const m of matches) {
    const norm = normalizeUgPhone(m);
    if (norm) out.add(norm);
  }
  return Array.from(out);
}

/** Phones that appear immediately after the word "to" (payout recipient). */
export function extractToPhones(r: EmailRowLike): string[] {
  const hay = `${r.subject ?? ''} ${r.snippet ?? ''} ${r.counterparty ?? ''}`;
  const out = new Set<string>();
  const re = /\bto\s+(?:\+?256|0)\s*7\d{2}[\s-]?\d{3}[\s-]?\d{3}/gi;
  const matches = hay.match(re) ?? [];
  for (const m of matches) {
    const norm = normalizeUgPhone(m);
    if (norm) out.add(norm);
  }
  return Array.from(out);
}

/** Transaction id / reference normalised for an in-list query. */
export function extractReferences(r: EmailRowLike): string[] {
  const out = new Set<string>();
  if (r.transaction_id) out.add(r.transaction_id.trim().toUpperCase());
  return Array.from(out);
}