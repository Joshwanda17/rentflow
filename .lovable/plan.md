

# Fix Withdrawal Flow: Ledger-First Architecture

## The Problem

The withdrawal pipeline has a critical structural flaw that violates the platform's core financial principle:

**Current (broken) flow:**
1. User requests withdrawal → `trg_deduct_wallet_on_withdrawal_request` trigger fires → wallet balance reduced **directly** (no ledger entry)
2. FinOps approves → status updated to `approved`/`fin_ops_verified` → audit log written → **still no ledger entry**
3. Rejection works correctly — `reject-withdrawal` edge function creates balanced ledger entries via `create_ledger_transaction` RPC to restore funds

**Result:** Every approved withdrawal creates permanent wallet-ledger drift. The wallet shows less money but the ledger has no record of why. This is the root cause of the ~UGX 81.3M drift identified in the financial audit.

## The Fix

Two changes: disable the rogue trigger, and create an `approve-withdrawal` edge function that writes balanced ledger entries.

### 1. Database Migration — Disable the Rogue Trigger

```sql
-- Drop the trigger that directly mutates wallets outside the ledger
DROP TRIGGER IF EXISTS trg_deduct_wallet_on_withdrawal_request 
  ON public.withdrawal_requests;
```

The trigger function `deduct_wallet_on_withdrawal_request()` can remain (harmless without the trigger). This is a single, clean migration.

**Balance protection:** Without the trigger, the balance check moves into the approval function. Users can still only withdraw what they have — checked at approval time instead of request time. To prevent over-requesting, we add a client-side check against available balance (already exists in `WithdrawRequestDialog.tsx`).

### 2. Create `supabase/functions/approve-withdrawal/index.ts`

A new edge function that:
- Validates the caller has an authorized role (operations, cfo, coo, super_admin)
- Accepts: `withdrawal_id`, `reference` (TID/bank ref), `payment_method`
- Fetches the withdrawal request, validates it's still `pending` or `manager_approved`
- Checks wallet balance via ledger (not wallets table) to confirm funds exist
- Calls `create_ledger_transaction` RPC with balanced entries:

```text
Entry 1: wallet / cash_out / wallet_withdrawal  (user's wallet debited)
Entry 2: platform / cash_in / wallet_withdrawal  (platform records outflow)
```

- Updates `withdrawal_requests` status to `approved` with FinOps metadata
- Writes audit log with full metadata
- Returns success with new balance

The `sync_wallet_from_ledger` trigger automatically updates the wallet balance from the ledger entry — no manual wallet mutation needed.

### 3. Update Frontend Approval Flows

**`src/components/financial-ops/FinOpsWithdrawalVerification.tsx`** — Replace direct `.update()` on `withdrawal_requests` (line ~98-111) with `supabase.functions.invoke('approve-withdrawal', ...)`.

**`src/components/financial-ops/ApprovalQueue.tsx`** — Replace direct `.update()` on `withdrawal_requests` (line ~251-264) with `supabase.functions.invoke('approve-withdrawal', ...)` for the approval path. Rejection path is already correct (uses `reject-withdrawal` edge function).

### 4. Handle "Funds Reserved" State (Preventing Double-Requests)

Without the immediate deduction trigger, users could theoretically submit multiple withdrawal requests exceeding their balance. To prevent this:

- Add a check in the `WithdrawRequestDialog` that sums pending withdrawal amounts and subtracts from available balance before allowing a new request
- The `approve-withdrawal` edge function also validates sufficient balance at approval time as a server-side guard

## Files Changed

- **Migration**: Drop `trg_deduct_wallet_on_withdrawal_request` trigger
- **Create**: `supabase/functions/approve-withdrawal/index.ts`
- **Edit**: `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — use edge function
- **Edit**: `src/components/financial-ops/ApprovalQueue.tsx` — use edge function for approvals
- **Edit**: `src/components/wallet/WithdrawRequestDialog.tsx` — subtract pending withdrawals from available balance

## Ledger Flow After Fix

```text
REQUEST TIME (no money moves):
  withdrawal_requests INSERT → status: 'pending'
  wallet.balance: unchanged
  ledger: unchanged

APPROVAL TIME (money moves via ledger):
  approve-withdrawal edge function:
  ┌──────────────────────────────────────────────┐
  │ wallet  / cash_out / wallet_withdrawal       │
  │ platform / cash_in / wallet_withdrawal       │
  │ → sync_wallet_from_ledger fires              │
  │ → wallet.balance decreases automatically     │
  └──────────────────────────────────────────────┘

REJECTION (already correct):
  reject-withdrawal edge function:
  → system_balance_correction entries (no-op since
    wallet was never deducted in new flow)
```

**Note on rejection:** After this fix, the `reject-withdrawal` function's refund logic becomes a no-op for new requests (wallet was never deducted). The idempotency check already handles this gracefully. We'll add a guard to skip the refund if no prior deduction exists.

## What This Fixes

- Stops all future wallet-ledger drift from withdrawals
- Makes the ledger the authoritative record of every withdrawal
- Cash & Liquidity dashboard becomes accurate
- Transaction history shows withdrawal entries
- Audit trail becomes complete and reliable

