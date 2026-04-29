## Problem

The "Confirm deposit" button in `DepositFlow.tsx` (step 3 of the Deposit-to-Wallet sheet) is *not actually broken* — it does fire `handleAttempt()` on every tap. What is broken is the **feedback**: when a required field is missing, the user sees nothing happen.

Concretely, on the screenshot:

- Channel = MoMo / Airtel, Amount = UGX 9,400, but **no TID has been entered** (the TID input is above the fold, hidden by the scrolling card).
- Tap on Confirm → `handleAttempt` → `blockReason = "Enter your Airtel Money TID from the SMS…"` → `toast.error(...)`.
- On a small phone the Sonner toast renders at the top, behind the sticky dialog header, and disappears in ~3s. The agent sees the button "do nothing" and reports it as broken.

Other silent block paths today:

1. `validateForm()` in `handleSubmit` re-checks the same things and toasts again — equally invisible.
2. The submit button is only `disabled={isSubmitting}` — it stays visually enabled even when the form can't pass validation, which is correct, but with no inline reason.
3. The blockReason hint above the button (`{blockReason && !isSubmitting && …}`) only mentions TID and tenant-allocation drift. Missing amount / date / time / receipt number / agent name fall straight through to invisible toasts.

## Fix (permanent)

All edits in `src/components/payments/DepositFlow.tsx`. No DB / edge-function changes.

### 1. Single source of truth for "why can't I submit?"

Refactor the inline block-reason logic into one helper `computeBlockReason()` that returns `{ message, fieldId } | null` covering **every** validation case currently in `validateForm`:

- amount empty / NaN / `< MIN_DEPOSIT` / `> MAX_DEPOSIT`
- TID missing or wrong prefix per `momoProvider`
- bank reference missing
- agent_cash receipt number / agent name missing
- cash receipt number missing
- transaction date / time missing or future / >7 days old
- purpose `'other'` with no reason text
- operational_float tenant breakdown mismatch (existing logic)

`validateForm()` is rewritten to delegate to `computeBlockReason()` so the toast text and inline hint stay in lock-step (no more drift between the two).

### 2. Always-visible inline hint above the button

Replace the current narrow hint block with one that:

- Renders whenever `blockReason` is non-null (not just for TID/allocation).
- Uses `bg-destructive/10 border-destructive/40 text-destructive-foreground` so it reads as a real error, not a soft warning.
- Includes a small "Fix it" link/button on the right. Tapping it calls `scrollIntoView({ block: 'center', behavior: 'smooth' })` on the offending field via the `fieldId` returned from `computeBlockReason`.

### 3. Auto-scroll + focus on tap

`handleAttempt`:

```text
if (blockReason) {
  toast.error(blockReason.message);
  document.getElementById(blockReason.fieldId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  document.getElementById(blockReason.fieldId)?.focus?.();
  return;
}
handleSubmit();
```

So even if the toast is missed, the screen physically jumps to the empty field and focuses it. The dead-button feeling disappears.

### 4. Add stable `id`s to every input the block-reason can point at

Add `id="deposit-amount"`, `id="deposit-tid"`, `id="deposit-date"`, `id="deposit-time"`, `id="deposit-receipt"`, `id="deposit-agent-name"`, `id="deposit-reason"`, `id="deposit-tenant-allocator"`. These are the scroll/focus targets.

### 5. Make `isSubmitting` resilient

Wrap the inner body of `handleSubmit` in a `try/catch/finally` that **always** clears `isSubmitting` (today the early `return` after the auth guard at line 656 leaves `isSubmitting = true` if `user` is null because `setStep('form')` runs but `setIsSubmitting(false)` never does — the Confirm button then stays in the spinner state forever and the user sees a permanently dead button).

Fix: move `setIsSubmitting(true)` to *after* the auth check, or add `setIsSubmitting(false)` to every early-return branch. Cleanest is to move it.

### 6. Defensive: also clear `isSubmitting` when the dialog is closed mid-submit

In `handleClose` and the `useEffect` that resets state on `open === false`, also set `isSubmitting = false`. Prevents a re-open showing the spinner from a previous aborted attempt.

### 7. Console breadcrumb

Log `console.warn('[DepositFlow] submit blocked:', blockReason)` and on real failures `console.error('[DepositFlow] submit failed:', error)`. Lets the next session-replay/console-log capture pin-point future regressions in one tool call.

## What the user will see after the fix

- If they tap Confirm with the TID empty: the page scrolls to the TID input, the input gets focus and the keyboard pops up, and a red banner above the Confirm button says exactly what to fix.
- Same behaviour for missing date/time/amount/etc.
- If `handleSubmit` ever fails (auth lapse, RLS error), the spinner clears and the form re-appears with a toast — no more "stuck on submitting".

## Out of scope

- The Pay-Now-via-Airtel anchor swap (already shipped).
- Any change to the deposit RPC, RLS, or Financial-Ops verification flow.
- Wallet-deduction / withdrawable-vs-float UI (already shipped).
