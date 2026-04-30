## Problem

On `/admin/financial-ops` → **CFO Direct Credit** panel, submitting a **Balance Correction (Credit/Debit)** (or any other category whose `recipientLock` is `'user'`) sometimes fails with:

> Routing rejected: 'system_balance_correction' is money owned by the recipient — choose 'User' (Withdrawable) instead of 'Operational Wallet'.

The edge function (`supabase/functions/cfo-direct-credit/index.ts`) is correct — `system_balance_correction` is user-owned and must route to the user's withdrawable bucket. The bug is in the UI: `DirectCreditTool.tsx` relies on a `useEffect` to auto-set `recipientType` after a category is picked. If the user previously chose an `operational_wallet`-locked category in the same session (or the effect hasn't flushed before submit / state is stale), `recipientType` stays as `'operational_wallet'` and gets sent to the edge function, which then rejects it with the routing error.

The lock is enforced at the click handler and via `disabled`, but the submit payload is never re-derived from the category lock.

## Fix

Make the locked recipient the single source of truth at submit time, instead of relying on async `useEffect` state.

### `src/components/cfo/DirectCreditTool.tsx`

1. In the `mutationFn`, compute the effective recipient at submit time:
   ```ts
   const effectiveRecipient: RecipientType =
     selectedCategory.recipientLock !== 'either'
       ? selectedCategory.recipientLock
       : (recipientType as RecipientType);
   ```
   Validate `effectiveRecipient` is set, then pass `recipient_type: effectiveRecipient` in the edge-function body. This guarantees that any category with a hard lock always sends the correct routing, regardless of the radio's stale state.

2. Tighten the auto-lock effect so it also runs when `operation` changes (not just `selectedCategory`), and reset `recipientType` to `''` whenever the operation changes / category changes to an `'either'` lock. That keeps the visible UI in sync with what is actually submitted.

3. In `handleOperationChange`, also clear `recipientType` (currently only clears category/sub-category), so the radio cannot retain a stale `operational_wallet` selection from a previous category.

4. Guard the submit button: also disable it when `selectedCategory?.recipientLock !== 'either'` and `recipientType !== selectedCategory.recipientLock` (cheap UI-side belt-and-braces — but the real fix is #1).

No edge-function or DB changes are needed — the backend rule is correct and stays as the final guard.

## Verification

1. On `/admin/financial-ops` → CFO Direct Credit, switch operation Credit → Debit → Credit, change categories around (Tax Payment → Balance Correction Credit), and confirm submitting Balance Correction always lands in the user's withdrawable bucket without the routing-rejected toast.
2. The "Operational Wallet" button stays disabled with the lock badge for `system_balance_correction`, ROI, payroll, agent commission, etc.
3. The success path still posts a balanced `system_balance_correction` ledger pair tagged `recipient_type: 'user'`.
