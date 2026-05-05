/**
 * SMS deposit-confirmation parser.
 *
 * Pure, dependency-free extractor used by the "Paste from SMS" button in
 * `DepositFlow`. Given the raw text of a MoMo / bank confirmation SMS,
 * pulls out the four fields the deposit form requires:
 *
 *   • amount         (UGX integer)
 *   • transactionId  (MTN MP…, Airtel TID…, or generic Ref/Receipt token)
 *   • date           (normalised to YYYY-MM-DD for <input type="date">)
 *   • time           (normalised to 24h HH:MM for <input type="time">)
 *
 * Any field that can't be confidently parsed is left undefined — the
 * caller is responsible for hard-blocking submit until all four are set.
 */

export interface ParsedSMS {
  amount?: number;
  transactionId?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM (24h)
}

/** Normalise a date token (DD/MM/YYYY, D-M-YY, YYYY-MM-DD) → YYYY-MM-DD. */
function normaliseDate(raw: string): string | undefined {
  const trimmed = raw.trim();

  // Already ISO-ish: YYYY-MM-DD
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY (Ugandan SMS convention is day-first)
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return undefined;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/** Normalise DD-Mon-YYYY / D Mon YY style dates → YYYY-MM-DD. */
function normaliseNamedDate(d: string, mon: string, y: string): string | undefined {
  const mm = MONTH_MAP[mon.slice(0, 3).toLowerCase()];
  if (!mm) return undefined;
  const yyyy = y.length === 2 ? `20${y}` : y;
  return `${yyyy}-${mm}-${d.padStart(2, '0')}`;
}

/** Normalise a time token (HH:MM, H:MM AM/PM, HH:MM:SS) → 24h HH:MM. */
function normaliseTime(raw: string): string | undefined {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s?(AM|PM)?$/i);
  if (!m) return undefined;
  let hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && hh < 12) hh += 12;
  if (ampm === 'AM' && hh === 12) hh = 0;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function parseSMS(text: string): ParsedSMS {
  const result: ParsedSMS = {};
  if (!text) return result;

  // ── Amount ──────────────────────────────────────────────────────────
  // Matches "UGX 50,000", "USh 50000", "UShs.50,000.00", "Shs 1,200"
  // Skips tokens preceded by Bal/Balance/Charge/Fee so "Bal UGX 323,546" or
  // "Charge UGX 0" don't get mistaken for the paid amount.
  const amountRe = /(?:UGX|USh|UShs|Shs)\s*\.?\s*([\d,]+(?:\.\d+)?)/gi;
  const skipRe = /(bal(?:ance)?|charge|fee|fees)\s*[:.]?\s*$/i;
  let firstAmt: number | undefined;
  let chosenAmt: number | undefined;
  for (const m of text.matchAll(amountRe)) {
    const cleaned = m[1].replace(/,/g, '');
    const n = Math.round(parseFloat(cleaned));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (firstAmt === undefined) firstAmt = n;
    const start = m.index ?? 0;
    const lookback = text.slice(Math.max(0, start - 12), start);
    if (skipRe.test(lookback)) continue;
    chosenAmt = n;
    break;
  }
  if (chosenAmt !== undefined) result.amount = chosenAmt;
  else if (firstAmt !== undefined) result.amount = firstAmt;

  // ── Transaction ID ─────────────────────────────────────────────────
  // Try provider-specific formats first (highest signal), then generic.
  const mtn = text.match(/\bMP[A-Z0-9]{8,}\b/i);
  // Allow optional separator between TID and digits ("TID 146525101664",
  // "TID.146...", "TID:146..."). Stored canonically as "TID<digits>".
  const airtel = text.match(/\bTID[\s.:#-]*(\d{4,18})\b/i);
  // New MTN MoMo format: "ID: 40473329892" (bare digits, no MP prefix).
  // The leading lookbehind `(?:^|[^A-Z])` deliberately rejects the "ID"
  // inside "TID" so the Airtel rule above wins for Airtel SMS.
  const mtnNew = text.match(/(?:^|[^A-Z])ID[:\s.#-]+(\d{8,18})\b/i);
  const generic = text.match(
    /\b(?:Txn\s?ID|Transaction\s?ID|Ref(?:erence)?|Receipt)[:\s#]*([A-Z0-9-]{4,})\b/i,
  );
  if (mtn) result.transactionId = mtn[0].toUpperCase();
  else if (airtel) result.transactionId = `TID${airtel[1]}`;
  else if (mtnNew) result.transactionId = mtnNew[1];
  else if (generic) result.transactionId = generic[1].toUpperCase();

  // ── Date ───────────────────────────────────────────────────────────
  const numericDate = text.match(
    /\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/,
  );
  if (numericDate) {
    const normalised = normaliseDate(numericDate[1]);
    if (normalised) result.date = normalised;
  }
  if (!result.date) {
    // Month-name dates: "04-May-2026", "4 May 2026", "04/May/26"
    const named = text.match(
      /\b(\d{1,2})[\s/-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s/-](\d{2,4})\b/i,
    );
    if (named) {
      const normalised = normaliseNamedDate(named[1], named[2], named[3]);
      if (normalised) result.date = normalised;
    }
  }

  // ── Time ───────────────────────────────────────────────────────────
  const timeMatch = text.match(/\b(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM)?)\b/i);
  if (timeMatch) {
    const normalised = normaliseTime(timeMatch[1]);
    if (normalised) result.time = normalised;
  }

  return result;
}