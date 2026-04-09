

# Batch Negative Balance Correction — Execution Plan

## Confirmed State
- **442 users** with negative wallet ledger balances
- **Total deficit**: UGX 130,209,864
- Top offender: `99890a2e...` at -83.6M (64% of total)
- `create_ledger_transaction` function exists and available

## Execution (4 Migrations)

### Migration 1 — Correction Entries
Run the DO block that loops through all 442 negative-balance users, calling `create_ledger_transaction` for each with:
- Wallet `cash_in` for the user (brings balance to zero)
- Platform `cash_out` offset (platform absorbs the error)
- Category: `system_balance_correction`
- Wrapped in BEGIN/EXCEPTION for fault tolerance

### Migration 2 — Wallet Reconciliation
Force `wallets.balance` to match ledger truth using the UPDATE statement, catching any rows where the trigger's `GREATEST(0)` clamping caused drift.

### Migration 3 — Validation
Run the three validation queries:
1. Remaining negatives = 0
2. Total correction ≈ 130M
3. Wallet-ledger drift rows = 0

### Migration 4 — (If needed) Fix any stragglers from validation

## Expected Impact
- Platform cash decreases by ~130.2M (correct — absorbing historical errors)
- All 442 users' wallet balances become non-negative
- Full audit trail via `system_balance_correction` category
- No data deleted, append-only

## Pre-requisites (Your Responsibility)
1. Disable withdrawals, ROI payouts, auto jobs
2. Ensure no active financial transactions
3. Database backup taken

## Post-Run
1. Re-enable withdrawals, ROI payouts, automation
2. Monitor CFO dashboard Golden Rule section

Shall I proceed with executing the migrations?

