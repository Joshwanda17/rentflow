
## Rule
**Withdrawable balance** = `withdrawable_balance + advance_balance`. **Float stays locked** (operational/company money, not user money).

Auto-advance recovery still runs — but since advance now counts toward withdrawable, the user effectively keeps full access to CFO credits.

## Changes

### 1. `WithdrawFlow.tsx`
- Compute `availableToWithdraw = withdrawable_balance + advance_balance`.
- Display single **"Available to Withdraw"** = sum of both buckets.
- Show **Float** as read-only "Operational Float (not withdrawable)".
- Validate against the combined total.

### 2. Withdrawal processing (DB)
- Update the withdrawal RPC to debit `withdrawable_balance` first, then `advance_balance` for the remainder. Float is never touched.

### 3. `DirectCreditTool.tsx` (CFO preview)
- Categories landing in `withdrawable` or `advance` → **"Withdrawable by user"** (green).
- Categories landing in `float` → **"Operational Float — not withdrawable"** (amber).

### 4. Unchanged
- Ledger categories, `create_ledger_transaction` RPC, audit logs, RLS, role isolation.
- Trigger category→bucket routing (auto-advance recovery still runs).
- Float-generating flows (rent disbursement, partner top-up parking).

## Files
- `src/components/payments/WithdrawFlow.tsx`
- `src/components/cfo/DirectCreditTool.tsx`
- 1 migration: withdrawal RPC drains `withdrawable_balance` then `advance_balance`.

## Example
CFO credits UGX 500k to an agent owing UGX 200k advance → trigger sweeps 200k into advance, 300k into withdrawable. UI shows **"Available: 500k"**. Agent withdraws all 500k. Float credits (rent disbursement) stay locked.
