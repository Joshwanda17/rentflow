# Why "Approve & Complete" never reaches FinOps for these cards

## What the data confirms

I checked every angle:

- All 9 stuck cards have `fin_ops_approved_at = NULL`, `fin_ops_reference = NULL`, `processed_at = NULL`.
- Zero ledger entries reference any of these withdrawal IDs in `general_ledger`.
- Zero `withdrawal_approved` `system_events` for any of these IDs (the only one today was WAKATO ALI at 11:19, which IS `approved` and correctly gone from the list).
- Zero edge function calls to `approve-withdrawal` in the last 6 hours.
- All 9 are stuck in `manager_approved` state — Manager pressed approve, FinOps never finished.

So the cards aren't "ghost approvals". The FinOps "Approve & Complete" dialog is simply not being completed (the operator opens it and abandons, OR the button silently fails to send).

But there are TWO real bugs we should fix while we're here:

## Bug 1: Approve button gives no feedback if validation fails silently

The Approve button is disabled until `reference.length ≥ 3` AND `paymentMethod` is selected. If either is missing, the button just looks dead — no toast, no hint. On a 384-wide phone the dialog is cramped; the operator may think they tapped Approve but actually nothing fired.

## Bug 2: List has no realtime refresh

Even when an approve does succeed, other FinOps operators on other devices won't see the card disappear until they manually press the refresh icon. Cards from yesterday can linger visually if the page hasn't been reloaded.

## Bug 3: No way to clear stale `manager_approved` cards quickly

The 9 stuck cards from today need to either be (a) actually paid + completed with TID, or (b) rejected if they were duplicates / errors. Right now there's no fast path.

## Plan

### Step 1 — Make the dialog impossible to abandon silently
In `src/components/financial-ops/FinOpsWithdrawalVerification.tsx`:
- Add visible inline hints under the Payment Method and Reference inputs ("Pick a method to enable Approve" / "Enter at least 3 chars").
- Add a stage badge on each pending card: yellow "Awaiting Manager", blue "Manager Approved → needs FinOps TID", purple "CFO Approved", green "FinOps Approved → finalising". Operator sees instantly which cards still need their action.
- Add a tiny age countdown chip ("47m old") that turns amber after 1h and red after 4h, so stuck cards stand out.

### Step 2 — Realtime auto-refresh
Add a `supabase.channel('finops-withdrawals')` subscription on `withdrawal_requests` that calls `fetchRequests()` on INSERT/UPDATE. The moment any operator (or edge function) flips a card to `approved`/`rejected`, it disappears from everyone's screen. Cleans up the manual-refresh dance.

### Step 3 — Triage the 9 currently stuck cards
Two safe options I can run for you on your say-so:
- **Option A — bulk reject all 9 with reason "Manager-approved but FinOps did not complete; please re-request"**, so users re-submit and you start clean. Their wallets are untouched (no ledger entries exist).
- **Option B — leave them; Financial Ops finishes each one manually** with the real TID/RCT for whichever ones are already paid out off-platform.

I will NOT auto-approve them — that bypasses the TID capture which is the whole point of the FinOps step (Withdrawal Governance + Funder Deposit Workflow rules).

## Files to touch

- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — stage badge, inline validation hints, age chip, realtime channel subscription on `withdrawal_requests`.

## What I will NOT do

- Won't change the `approve-withdrawal` edge function or wallet/ledger logic — that path works (verified by yesterday's successful approvals: PV013, RCT 027, A849C24DB9094, etc.).
- Won't auto-flip `manager_approved` → `approved`. Locked governance.
- Won't add new tables or DB schema changes.

## After you approve

Tell me whether to also run **Option A (bulk reject the 9)** or leave triage to your operators.
