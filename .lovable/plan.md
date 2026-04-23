

# Repair corrupt wallet + reverse phantom withdrawal leg

## What's wrong (confirmed via DB)

User `cb798acb-…e030b6` (the funder) wallet row is broken:

| field | actual | should be |
|---|---|---|
| `balance` | **0** | 3,100 |
| `withdrawable_balance` | 100 | 100 |
| `float_balance` | 3,000 | 3,000 |
| `advance_balance` | 0 | 0 |

Ledger net (wallet scope) = **+3,100**, so the bucket totals are right; only `balance` is stale.

On top of that, the failing 07:38:24 withdrawal **wrote a `wallet_withdrawal` cash_out ledger entry for UGX 500,000** before the bucket trigger aborted the wallet UPDATE. That leg is sitting in `general_ledger` but no money actually left the wallet. The ledger net above (+3,100) **already includes** that phantom −500,000 — meaning the true reconciled balance is actually **3,100 + 500,000 = UGX 3,600** before that bad leg.

Wait — let me re-read: net = total_in (2,229,100) − total_out (2,226,000) = 3,100. The 500,000 cash_out IS counted in total_out. If we reverse it, net becomes 503,100. So the user's true wallet should be **UGX 503,100** once the phantom leg is reversed. The historical bad `system_balance_correction` and `test_funds_cleanup` entries (Mar 4–9) explain why ledger and buckets drifted from `balance` originally.

## Fix — 3 steps, all via migration (no app code change)

### Step 1 — Reverse the phantom withdrawal leg
Insert a balancing `cash_in` ledger entry of UGX 500,000 with category `system_balance_correction`, description `"Reversal of failed withdrawal 3fb2da7e-f311-4c2c-adb2-2e5f6beb3288 (bucket invariant aborted payout)"`, plus the matching platform `cash_out` leg, via `create_ledger_transaction` RPC so it routes through the proper double-entry path.

### Step 2 — Mark the withdrawal request itself as `failed`
Update `wallet_withdrawals` row `3fb2da7e-…` from whatever "approved/processing" state it's in → `failed` with reason `bucket_invariant_violation`, so Financial Ops doesn't see it as outstanding.

### Step 3 — Heal the wallet `balance` column
Run a one-shot SQL inside the migration that bypasses the trigger guard (using the `app.allow_wallet_sync = true` session flag the existing `apply_wallet_movement` infra uses) to set:
```sql
UPDATE wallets
SET balance = withdrawable_balance + float_balance + advance_balance
WHERE user_id = 'cb798acb-68bc-4b4e-a414-a3d374e030b6';
```
After Step 1 this will be **UGX 503,100** (100 withdrawable + 3,000 float + 500,000 newly-restored withdrawable from the reversal — the reversal's `cash_in` will route to the withdrawable bucket via the standard router).

### Step 4 — System-wide drift sweep (optional but recommended)
Same migration runs:
```sql
SELECT user_id, balance, withdrawable_balance + float_balance + advance_balance AS bucket_sum
FROM wallets
WHERE balance <> withdrawable_balance + float_balance + advance_balance;
```
If other users are drifting, heal them with the same controlled UPDATE. If the list is large (>50), I'll only heal this one user and surface the rest for manual CFO review.

## Why this is a migration, not an edge function

- It's a one-time data repair, not a feature.
- It needs the privileged session flag to bypass the bucket invariant trigger that (correctly) blocks normal writes.
- It must be auditable in `audit_logs` with reason `WLT-REPAIR-1` (10 chars).

## After the fix

The user retries withdrawal. Their withdrawable bucket will be UGX 500,100 → the UGX 500,000 request will succeed cleanly through the normal `approve-withdrawal` → `apply_wallet_movement` path.

## Files touched

- ONE new migration (SQL only — repair + audit log).
- No edge function or React changes.

