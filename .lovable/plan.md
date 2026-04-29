
## What's actually happening

I checked the database and the deposit pipeline. Two separate issues are stacked under one complaint.

### 1. The button looks broken — but it's actually disabled silently

For Airtel/MTN merchant deposits, the "Confirm deposit" button is gated on a valid TID being typed into the form (`TID…` for Airtel, `MP…` for MTN). In the screenshot, no TID has been entered yet, so the button is technically present but disabled. There is **no inline message** telling the user *why* — it just looks dead.

Verified in `DepositFlow.tsx`:
- `blocked = isSubmitting || (channel === 'momo' && !isTidValid())`
- If `isTidValid()` returns false, the button silently disables with no hint.

### 2. The deposit IS being recorded — but the depositor can't see where it stands

Database confirms every recent deposit was successfully inserted into `deposit_requests` (status `pending` → later `approved` by Financial Ops operator Sharimah). However:
- After submit, the user sees a generic ✅ success screen with no link/CTA to a "track my deposit" view.
- The Financial Ops queue (`VerifyDepositsHub`) is operator-only — depositors can't see their own row sitting in queue.
- Approval times for Carolyne's recent deposits ranged from 2 minutes to **17 hours** — so "I deposited and can't see it anywhere" is a real frustration.

---

## The fix

### A. Make the deposit button self-explanatory (DepositFlow.tsx)

1. Always render the button **enabled-looking** but, on click when blocked, show a toast that explains exactly what's missing:
   - "Enter your Airtel TID from the SMS (starts with TID…) to confirm"
   - "Enter your MTN MoMo TID from the SMS (starts with MP…)"
   - "Fix the tenant breakdown to continue"
2. Add a small inline hint **directly under the TID input** when the field is empty or wrong-prefix, so the user knows what to type before they even reach the button.
3. Surface a tiny "Why is this button greyed out?" affordance next to the button when blocked.

### B. Add a "My recent deposits" tracker after submission

1. On the success screen of `DepositFlow`, replace the generic success copy with a live mini-tracker showing the just-submitted deposit:
   ```text
   ✓ Submitted     →  ⏳ Awaiting Financial Ops  →  💰 Wallet credited
   ```
   With status text: *"Financial Ops usually reviews within a few hours. We'll credit your wallet as soon as they verify."*
2. Add a "View my deposits" button on the success screen that opens an existing `DepositHistory` route (already exists in the codebase) filtered to the current user.
3. On the depositor's wallet/dashboard, add a small "Pending deposits (N)" badge linking to that same history view — so they always have a way back to "where is my deposit?"

### C. Tiny FinOps-side ergonomics improvement

In `VerifyDepositsHub.tsx` the "User Deposits" tab currently counts only `status='pending'`. Add a sibling view "Recently verified (last 24h)" so when a depositor calls in saying "I can't see my deposit", a FinOps operator can confirm in one click whether it was already approved. (Already partially exists as `RecentlyVerifiedList` — just promote it to a sub-tab on the User Deposits screen.)

---

## Files to change

- `src/components/payments/DepositFlow.tsx`
  - Replace `disabled={blocked}` with an always-enabled button that calls a `handleAttempt()` wrapper which toasts the specific reason when blocked.
  - Add inline TID hint under the transaction-ID input.
  - Replace the generic success step with a `DepositTrackerCard` (3-step visual + "View my deposits" CTA).
- `src/components/payments/DepositTrackerCard.tsx` *(new — small, ~60 lines)*
  - 3-step status bar, copy explaining FinOps verification, link to `/deposits/history`.
- `src/components/financial-ops/VerifyDepositsHub.tsx`
  - Add a "Recently verified" sub-tab under "User Deposits" that mounts the existing `RecentlyVerifiedList`.

## What I am NOT changing

- The submit logic itself works — verified end-to-end against DB. No changes to the insert into `deposit_requests`, no migrations, no RLS changes.
- The Financial Ops auto-approve trigger does not exist (and shouldn't) — verification stays manual per Financial Separation of Powers memory.
- No changes to the wallet/ledger sync path.

