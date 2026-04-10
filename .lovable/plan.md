# Fix Phantom Wallet Balances (PAMELA SSAKA & YAWE MIKE)

## Problem

Both users have wallet balances not backed by their ledger. Their ledger entries net to zero, but `wallets.balance` shows positive amounts. This is drift caused by incorrectly scoped ledger entries (both legs written to the same user in wallet scope, canceling each other out).

## Solution: Force Reconciliation

Create `system_balance_correction` ledger entries via the `create_ledger_transaction` RPC to align wallet balances with ledger truth. Two options:

### Option A — Zero out the phantom wallets

If these balances are not real money owed to the users, create a correction entry that debits their wallet to zero:

- PAMELA SSAKA: `cash_out` 6,729,419 (system_balance_correction)
- YAWE MIKE: `cash_out` 45,000 (system_balance_correction)

### Option B — Back the wallets with correction credits

If the balances ARE real (money is owed), create a `cash_in` correction to establish ledger backing:

- PAMELA SSAKA: `cash_in` 6,729,419 (system_balance_correction)
- YAWE MIKE: `cash_in` 45,000 (system_balance_correction)

## Implementation

1. Create a database migration that calls `create_ledger_transaction` for each user with the chosen direction
2. Each correction entry will include metadata documenting the reconciliation reason
3. The `sync_wallet_from_ledger` trigger will automatically adjust wallet balances

## Technical Detail

- Uses existing `system_balance_correction` category (already approved)
- Entries paired with a platform-scope counterpart for proper double-entry
- Idempotency keys prevent accidental double-execution

## Decision Needed

Which option — zero out (Option A) or back with credits (Option B)?

Option A

&nbsp;