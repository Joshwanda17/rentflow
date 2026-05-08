# Replace stale-date block with duplicate-TID lookup

## What changes (and what doesn't)

The deposit form in `src/components/payments/DepositFlow.tsx` currently rejects any transaction whose date is older than 7 days, surfacing **"Transaction must be within the last 7 days"** as the inline blocker (the message visible in the screenshot for the `04/22/2026` TID `TID145635659834`).

That date heuristic is the wrong gate — a TID is either already in our system or it isn't, regardless of how old the SMS is. We will:

1. **Remove** the `txDate < weekAgo` branch from `computeBlockReason()` (lines 805 & 809–811 of `DepositFlow.tsx`). The "future date" check stays — that one is genuinely invalid.
2. **Add** an async "is this TID already registered?" check that runs whenever the user finishes typing/pasting a TID and the form is otherwise complete. It hits the same indexed query the submit-time duplicate guard already uses (lines 887–908):
   ```
   supabase
     .from('deposit_requests')
     .select('id, status')
     .ilike('transaction_id', normalizedRef)
     .not('status', 'in', '(rejected,cancelled,failed)')
     .limit(1)
   ```
3. **Surface** the result through the existing inline blocker UI (the red bar at lines 2119–2130). Message: `"This Transaction ID is already registered (status: <status>). Each TID can only be used once."` — pointing at `deposit-tid` so the existing "Fix" button focuses the TID input, not the date input.
4. The "Within last 7 days only" helper text under the date field (line 299 in `PaymentConfirmationForm.tsx`) and the `PaymentConfirmationForm` 7-day validator (line 59) are **out of scope** — they belong to a different form. Only `DepositFlow.tsx` is touched.

## How the lookup is wired

- New state in `DepositFlow`: `duplicateTidStatus: string | null` and `duplicateTidChecking: boolean`.
- New `useEffect` keyed on `[transactionId, momoProvider, channel, isEditMode]` that:
  - Skips edit mode and skips while `tidError` is non-empty / TID format invalid.
  - Debounces ~400 ms, normalizes via the same `getReferenceId()` helper used at submit, runs the query above, and stores the conflicting row's status.
  - Aborts in-flight checks via an `ignored` flag if the TID changes mid-flight.
- `computeBlockReason()` gains a new branch (placed **before** the date checks) that returns the duplicate-TID message + `fieldId: 'deposit-tid'` whenever `duplicateTidStatus` is set.
- The submit-time duplicate guard (lines 881–909) stays as the authoritative final gate — the inline check is a UX preview, not a replacement.

## Files

- `src/components/payments/DepositFlow.tsx` — only file edited.

## Out of scope

- No DB migration, no edge-function change, no schema change.
- No change to `PaymentConfirmationForm.tsx`, `DepositReferenceMatcher.tsx`, or any other deposit surface.
- No change to the submit-time duplicate guard or its toast.
