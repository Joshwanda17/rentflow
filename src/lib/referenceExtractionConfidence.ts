/**
 * Reference-extraction confidence + match-locating helper for the
 * redirect-deposit dialog.
 *
 * `parseSMS` (utils/smsParser) tells us *what* reference it pulled out of an
 * email body, but not *how* it matched it or *where* in the text it lives.
 * Financial-Ops operators need both to trust an auto-detected reference at a
 * glance, so this module:
 *
 *   1. Re-runs the same provider-specific → generic precedence used by
 *      parseSMS to classify HOW the reference matched and assign a
 *      confidence tier (high / medium / low / none).
 *   2. Locates the matched substring inside the original text so the UI can
 *      highlight exactly which characters produced the reference.
 *
 * Pure + dependency-free. Presentation-layer only — the strict validator and
 * the DB uniqueness trigger remain the authoritative gates.
 */

import { validateTransactionReference } from '@/lib/transactionReferenceValidator';

export type ExtractionConfidence = 'high' | 'medium' | 'low' | 'none';

export interface ReferenceExtraction {
  /** The reference value, normalised the same way parseSMS does. */
  reference: string;
  confidence: ExtractionConfidence;
  /** Short, operator-facing reason describing how/why we matched. */
  detail: string;
  /** Start index of the matched span inside the source text (−1 if not locatable). */
  matchIndex: number;
  /** Length of the matched span inside the source text. */
  matchLength: number;
}

const EMPTY: ReferenceExtraction = {
  reference: '',
  confidence: 'none',
  detail: '',
  matchIndex: -1,
  matchLength: 0,
};

// Provider-specific patterns, in the SAME precedence parseSMS applies.
// `strong` patterns identify a specific MNO / bank receipt shape and earn
// the highest confidence; the generic catch-all earns medium at best.
const STRONG_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /(?:^|[^A-Z])ID[:\s.#-]+(\d{8,18})\b/i, label: 'MTN MoMo transaction ID' },
  { re: /\bTID[\s.:#-]*(\d{4,18})\b/i, label: 'Airtel Money TID' },
  { re: /\bMP[A-Z0-9]{8,}\b/i, label: 'MTN reference code' },
  { re: /\b(?:FLW|FW)[A-Z0-9]{6,}\b/i, label: 'Flutterwave reference' },
  { re: /\b(?:FT|TXN|CR|DR|TRF|REF)[A-Z0-9]{6,}\b/i, label: 'bank reference' },
];

const GENERIC_PATTERN =
  /\b(?:Txn\s?ID|Transaction\s?ID|Trans\s?ID|Ref(?:erence)?|Receipt(?:\s?No)?|Confirmation)[:\s#]*([A-Z0-9-]{4,})\b/i;

/**
 * Inspect raw email text and return the extracted reference together with a
 * confidence tier and the span where it was found (for highlighting).
 */
export function extractReferenceWithConfidence(text: string): ReferenceExtraction {
  if (!text || !text.trim()) return EMPTY;
  const t = text.replace(/\s+/g, ' ').trim();

  // 1) Strong, provider-specific shapes (highest trust).
  for (const { re, label } of STRONG_PATTERNS) {
    const m = t.match(re);
    if (!m) continue;
    // The captured group (if any) is the bare ID; otherwise the full match.
    const captured = m[1] ?? m[0];
    const reference = re === STRONG_PATTERNS[1].re ? `TID${captured}` : captured.toUpperCase();
    const span = m[1] ?? m[0];
    const idx = t.indexOf(span, m.index ?? 0);
    const valid = validateTransactionReference(reference).valid;
    return {
      reference,
      confidence: valid ? 'high' : 'low',
      detail: valid
        ? `Matched a ${label}.`
        : `Looks like a ${label} but fails the reference check.`,
      matchIndex: idx,
      matchLength: span.length,
    };
  }

  // 2) Generic "Ref / Receipt / Confirmation" labelled value (medium trust).
  const g = t.match(GENERIC_PATTERN);
  if (g && g[1]) {
    const reference = g[1].toUpperCase();
    const idx = t.indexOf(g[1], g.index ?? 0);
    const valid = validateTransactionReference(reference).valid;
    return {
      reference,
      confidence: valid ? 'medium' : 'low',
      detail: valid
        ? 'Matched a labelled reference field in the email.'
        : 'Found a labelled reference but it fails the reference check.',
      matchIndex: idx,
      matchLength: g[1].length,
    };
  }

  return EMPTY;
}

export interface ConfidenceMeta {
  label: string;
  /** 0–100 for the visual meter. */
  percent: number;
  /** Tailwind class for the filled bar / pill accent. */
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}

export function confidenceMeta(confidence: ExtractionConfidence): ConfidenceMeta {
  switch (confidence) {
    case 'high':
      return { label: 'High confidence', percent: 100, tone: 'success' };
    case 'medium':
      return { label: 'Medium confidence', percent: 66, tone: 'warning' };
    case 'low':
      return { label: 'Low confidence', percent: 33, tone: 'danger' };
    default:
      return { label: 'No match', percent: 0, tone: 'neutral' };
  }
}

/**
 * Split source text into segments so the matched reference span can be
 * wrapped/highlighted in the UI. Falls back to a case-insensitive search for
 * the reference value when the precomputed index is unavailable.
 */
export function buildHighlightSegments(
  text: string,
  matchIndex: number,
  matchLength: number,
  reference: string,
): Array<{ text: string; match: boolean }> {
  const normalised = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!normalised) return [];

  let start = matchIndex;
  let len = matchLength;

  if (start < 0 || len <= 0) {
    // Fallback: locate the reference (or its digit core) case-insensitively.
    const probe = reference.replace(/^TID/i, '');
    const i = probe ? normalised.toLowerCase().indexOf(probe.toLowerCase()) : -1;
    if (i < 0) return [{ text: normalised, match: false }];
    start = i;
    len = probe.length;
  }

  const before = normalised.slice(0, start);
  const mid = normalised.slice(start, start + len);
  const after = normalised.slice(start + len);
  const out: Array<{ text: string; match: boolean }> = [];
  if (before) out.push({ text: before, match: false });
  if (mid) out.push({ text: mid, match: true });
  if (after) out.push({ text: after, match: false });
  return out;
}
