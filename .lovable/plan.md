## Problem

The example SMS the user shared exposes two parser gaps in `src/utils/smsParser.ts`:

```
PAID.TID 146525101664. UGX 300,000 to WELILE TECHNOLOGIES LIMITED Charge UGX 0. Bal UGX 323,546. 04-May-2026 16:20
```

Current behaviour against this string:
- ✅ **Amount** — `UGX 300,000` parses to `300000`.
- ❌ **TID** — regex is `\bTID\d{4,18}\b` (no separator), but the SMS has `TID 146525101664` with a **space**. No match.
- ❌ **Date** — regex only accepts numeric `DD-MM-YYYY` / `YYYY-MM-DD`. `04-May-2026` (month name) is rejected.
- ⚠️ **Bal UGX 323,546** appears *after* the paid amount — current amount regex grabs the **first** UGX token, which is the paid amount, so this is fine. But if a future SMS puts `Bal` before the paid amount we'd grab the wrong number. Worth hardening.
- ✅ **Time** — `16:20` parses correctly.

## Fix

Single file change: `src/utils/smsParser.ts`.

### 1. TID regex — allow optional separator
Change Airtel matcher to tolerate space, dot, colon or dash between the `TID` token and the digits, then strip the separator when storing:

```ts
const airtel = text.match(/\bTID[\s.:#-]*?(\d{4,18})\b/i);
if (airtel) result.transactionId = `TID${airtel[1]}`;
```

Also keep MTN `MP…` and the generic `Ref/Receipt` fallback as today.

### 2. Date regex — accept month-name format
Add a second matcher for `DD-Mon-YYYY` (e.g. `04-May-2026`, `4 May 2026`, `04/May/26`) and normalise via a small month-name map (`Jan…Dec`, case-insensitive). Try numeric first, then named-month:

```ts
const named = text.match(/\b(\d{1,2})[\s/-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s/-](\d{2,4})\b/i);
```

Normalise to `YYYY-MM-DD`. Two-digit years → `20YY`.

### 3. Amount — prefer the paid amount, not balance
Strengthen the amount matcher to skip tokens that follow the word `Bal`/`Balance`/`Charge`. Easiest implementation: scan all `UGX <number>` matches in order and pick the first one that isn't immediately preceded (within ~6 chars) by `Bal`, `Balance`, or `Charge`. Fall back to the first match if all are filtered.

### 4. Tests (lightweight)
Add a short test file `src/utils/__tests__/smsParser.test.ts` covering:
- The exact SMS in this thread.
- An MTN `MP…` SMS.
- An SMS with `Bal UGX …` before the paid line (to confirm we still grab the right amount).
- An SMS missing the time (to confirm `time` is `undefined`, not a false match).

No backend, schema, or `DepositFlow.tsx` changes needed — the consumer already reads `{amount, transactionId, date, time}` from the parser output.

## Files touched
- `src/utils/smsParser.ts` — regex + month-name normalisation + amount-vs-balance disambiguation.
- `src/utils/__tests__/smsParser.test.ts` — new, 4 cases.
