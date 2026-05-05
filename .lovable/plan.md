## Goal
Upgrade the existing "Paste from SMS" button in `DepositFlow` from a TID-only paste into a full SMS parser that auto-fills **Amount, Transaction ID, Date, and Time** in one tap, and hard-blocks submission when any of the four are missing or look wrong.

Validation for date/time at submit already exists (`computeBlockReason` lines 690–695) — this plan strengthens the paste step and the disabled-state of the Confirm button.

## Changes

### 1. New utility: `src/utils/smsParser.ts`
Pure function `parseSMS(text)` returning `{ amount?, transactionId?, date?, time? }`.

Extraction rules (broader than the spec to cover real MTN/Airtel/bank SMS in UGX):
- **Amount** — `/(?:UGX|USh|UShs|Shs)\s?([\d,]+(?:\.\d+)?)/i`, strip commas, parse as integer.
- **Transaction ID** — try in order:
  1. `/\bMP[A-Z0-9]{8,}\b/` (MTN)
  2. `/\bTID\d{4,18}\b/` (Airtel — same regex `extractTidFromText` already uses)
  3. `/\b(?:Txn\s?ID|Ref(?:erence)?|Receipt)[:\s#]*([A-Z0-9-]{4,})\b/i`
- **Date** — `/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/`, normalised to `YYYY-MM-DD` for the `<input type="date">`.
- **Time** — `/\b(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM)?)\b/i`, normalised to 24h `HH:MM` for `<input type="time">`.

Unit-friendly (no React deps) so we can add tests later.

### 2. Wire parser into `DepositFlow.tsx`
- Replace the body of `handlePasteTid` (lines 351–374) with a full SMS handler:
  - Read clipboard (keep current Safari fallback toast).
  - Call `parseSMS(text)`.
  - For each non-empty field, populate `setAmount`, `setTransactionId` (+ run `validateTid` for MoMo), `setTransactionDate`, `setTransactionTime`.
  - Auto-detect provider from TID prefix (`MP…` → mtn, `TID…` → airtel) and call `setMomoProvider` so the format validator picks the right rule.
  - Toast summary: e.g. *"Pasted: UGX 50,000 · TID144… · 2026-05-04 14:32"*.
  - If **any** of the 4 fields is missing → `toast.error("SMS missing required details — please paste the full confirmation message")` and highlight the first missing field via `setErrorFieldId`. Do **not** clear what we did parse — partial fill helps the agent finish manually.
- Rename the helper to `handlePasteSms` and update the button label hint copy (line 1417 area) to read *"Paste full SMS"* with a tooltip explaining what gets filled.

### 3. Strict submit gate
The existing `computeBlockReason()` already rejects missing `transactionDate`/`transactionTime`. We piggy-back on it:
- Add a derived `isFormValid = computeBlockReason() === null` and pass `disabled={isSubmitting || !isFormValid}` to the Confirm button so it visibly greys out until **Amount + TID + Date + Time** (and other channel rules) are all satisfied. Today the button only disables on `isSubmitting`.

### 4. No backend / schema changes
No migrations, no edge function changes, no RLS impact. Wallet/ledger flow is untouched — this is a UX + validation hardening pass on an existing form.

## Out of scope
- "Validate parsed amount vs expected ledger value" — there is no per-deposit expected amount on this flow (deposits are user-initiated, not invoice-bound). Server-side TID uniqueness + amount reconciliation already runs in the deposit verification pipeline; we won't duplicate it client-side.
- Cross-checking the SMS sender / shortcode (browsers can't read SMS metadata from a clipboard string).

## Files touched
- `src/utils/smsParser.ts` (new)
- `src/components/payments/DepositFlow.tsx` (replace `handlePasteTid`, button label, Confirm `disabled` prop)