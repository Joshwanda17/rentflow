# Fix Portfolio Top-Up Double-Deduction Bug

## Problem

The `portfolio-topup` Edge Function violates the **Single-Writer Principle**: it manually deducts the wallet balance (line 108-112) AND writes a `general_ledger` entry with a `transaction_group_id` (line 155-168), which triggers the `sync_wallet_from_ledger` database trigger to deduct *again*. This causes a double-deduction or incorrect wallet state.

**John Collins Mugodda's case:** UGX 303,411 ROI was received, then topped up into his portfolio. His wallet is now 0, the pending operation shows `status: approved`, but his portfolio capital was never increased (still UGX 2,022,740). The money is trapped.

## Immediate Data Fix

Reverse John Collins Mugodda's broken pending top-up so his wallet balance is restored:

- Update his wallet balance back to **303,411**
- Update the pending_wallet_operation status to `cancelled`
- Remove or nullify the orphaned ledger entry's `transaction_group_id` to prevent trigger interference

## Code Fix: `portfolio-topup` Edge Function

Remove the **manual wallet deduction** (lines 108-118). The ledger entry with `transaction_group_id` already triggers `sync_wallet_from_ledger` to handle the balance update atomically. This aligns with the Single-Writer Principle used across all other financial functions.

**Before:**

```
// 1. Manual wallet deduction (WRONG — triggers double-deduct)
await supabase.from("wallets").update({ balance: currentBalance - topupAmount })
// 2. Ledger entry with transaction_group_id (ALSO deducts via trigger)
await supabase.from("general_ledger").insert([...])
```

**After:**

```
// 1. Check balance is sufficient (read-only)
// 2. Ledger entry with transaction_group_id → trigger handles wallet deduction
await supabase.from("general_ledger").insert([...])
// 3. Verify wallet wasn't over-deducted (optimistic lock check)
```

## Files to Edit

- `supabase/functions/portfolio-topup/index.ts` — remove manual wallet update, rely on ledger trigger
- Database: data repair for John Collins Mugodda's wallet and pending operation

## Technical Details

- The optimistic lock check moves to a post-ledger verification: read the wallet after the trigger fires and confirm it didn't go negative
- If it did go negative (race condition), roll back the ledger entry
- The `pending_wallet_operations` insert remains unchanged
- This matches how `fund-rent-pool` and other functions already work (ledger-only, trigger-synced)

HIS PORTIFOLIO SHOULD ALSO BE UPDATED. DO NOT RESTORE HIS WALLET BALANCE TO 303411. JUST UPDATE THE PORTIFOLIO.

&nbsp;