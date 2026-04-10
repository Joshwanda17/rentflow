

# Top-Up Flow Audit: Findings and Required Fixes

## Inventory of Top-Up Edge Functions

| Function | Called From | Who Uses It |
|---|---|---|
| `portfolio-topup` | Partner's `InvestmentBreakdownSheet` | Partner (self-service) |
| `coo-wallet-to-portfolio` | `COOPartnersPage` | COO dashboard |
| `manager-portfolio-topup` | `FundInvestmentAccountDialog` | Manager / Partner Ops |
| `coo-invest-for-partner` | `COOPartnersPage` + `ActivePartnersDetail` | COO (new portfolio creation) |
| `apply-pending-topups` | `COOPartnersPage` | COO (maturity activation) |

---

## Audit Results

### `portfolio-topup` (Partner self-service) -- CORRECT
- Validates ownership (portfolio belongs to caller)
- Checks wallet balance before proceeding
- Records `pending_wallet_operations` with status `pending`
- Uses `create_ledger_transaction` RPC (wallet cash_out + platform cash_in)
- Has post-ledger negative-balance guard with reversal
- Does NOT update `investment_amount` -- correctly parks the top-up
- Verdict: **Follows golden path. No fix needed.**

### `coo-wallet-to-portfolio` (COO dashboard) -- CORRECT
- Role-checks caller (coo, manager, super_admin)
- Checks partner wallet balance
- Records `pending_wallet_operations` with status `pending`
- Uses `create_ledger_transaction` RPC (wallet cash_out + platform cash_in)
- Does NOT update `investment_amount` -- correctly parks
- Verdict: **Follows golden path. No fix needed.**

### `apply-pending-topups` (COO maturity activation) -- CORRECT
- Role-checks caller (coo, manager, cfo, super_admin)
- Fetches all pending ops for the portfolio
- Updates `investment_amount` (adds total pending)
- Marks pending ops as `approved`
- Records activation ledger entries via RPC
- Has rollback if approval fails
- Verdict: **Follows golden path. No fix needed.**

---

### `manager-portfolio-topup` (Partner Ops) -- BUG FOUND

**Critical issue on the non-wallet payment path (cash, mobile_money, bank):**

Lines 261-287 record a `cash_out` on the partner's **wallet** scope even though the money came from an external source (cash, mobile money, bank). This means:

1. Partner hands cash to manager
2. System deducts from partner's **wallet** (which the cash never came from)
3. Partner loses wallet balance for money they paid externally

This is a **phantom debit**. The wallet gets debited for money that entered externally.

**What should happen for non-wallet payments:**
- The pending operation is recorded (correct -- already done)
- The ledger entry should be `platform cash_in` only (external money entering the system)
- There should be NO `wallet cash_out` entry because the partner's wallet was never involved
- At maturity (`apply-pending-topups`), the `investment_amount` increases

**Fix required:**
- Remove the wallet-scope `cash_out` leg from the non-wallet payment path
- Keep only the `platform cash_in` leg (external capital received)
- The wallet path remains unchanged (it correctly debits wallet)

### `coo-invest-for-partner` (COO new portfolio) -- MINOR ISSUE

This function creates a **new** portfolio (not a top-up), so it's architecturally different. However:
- It only allows `manager` role (line 39), not `coo` or `super_admin` -- despite the function name saying "coo"
- Ledger flow is correct: wallet cash_out + platform cash_in via RPC
- Verdict: **Ledger flow correct. Role check is unnecessarily restrictive but not a financial bug.**

---

## Plan: Fix `manager-portfolio-topup` Non-Wallet Path

### 1. `supabase/functions/manager-portfolio-topup/index.ts`

**Change:** In the non-wallet (cash/mobile_money/bank) branch (lines 261-287), replace the two-legged ledger entry with a single platform-side entry:

```text
REMOVE:
  Leg 1: partnerId  wallet   cash_out  partner_funding  (WRONG -- wallet wasn't involved)
  Leg 2: null       platform cash_in   partner_funding

REPLACE WITH:
  Leg 1: partnerId  wallet   cash_in   partner_funding  (external money entering partner's capital)
  Leg 2: null       platform cash_in   partner_funding  (platform receives capital)
```

Wait -- this breaks double-entry balance. Let me reconsider.

For external payments (cash/MoMo/bank), the correct model is:
- Money enters the system from outside (not from any wallet)
- It should be parked as pending until verified
- At verification, `investment_amount` increases

The cleanest approach: **do not create any ledger entry at all for non-wallet payments at submission time**. The ledger entry should only be created when the payment is verified/approved (via `apply-pending-topups`). The `pending_wallet_operations` record is sufficient to track the intent.

This matches the deposit flow: deposits don't create ledger entries until approved.

### Changes

**`supabase/functions/manager-portfolio-topup/index.ts`:**
- Remove the `create_ledger_transaction` RPC call from the non-wallet branch (lines 261-287)
- Keep the `pending_wallet_operations` insert (this is correct -- it tracks the pending intent)
- The wallet branch remains unchanged (it correctly debits wallet via ledger)

No other files need changes. No database changes. No new tables.

### Why this is correct

- **Wallet payments**: Money moves from wallet to platform → ledger records both sides → wallet trigger deducts balance. Correct.
- **External payments (cash/MoMo/bank)**: Money hasn't entered the system yet at submission time. Recording it in the ledger creates a phantom debit. The `pending_wallet_operations` record tracks the intent. When `apply-pending-topups` runs at maturity, it creates the actual ledger entries and updates `investment_amount`.

