

# Fix Double Revenue + Harden Trigger

## Problem

The `sync_collection_to_ledger` trigger fires on every `subscription_charge_logs` INSERT and creates platform revenue entries (rent_principal_collected, access_fee_collected, registration_fee_collected). The edge function `auto-charge-wallets` ALSO creates these same entries via RPC. The current 5-minute time-based idempotency guard is unreliable (race conditions, retries, delayed jobs).

Result: **2x revenue** in the ledger per collection.

## Fix (2 Changes)

### 1. Strip revenue logic from the trigger — keep only bridge receivable reduction

The trigger should **never create money**. It should only:
- Reduce bridge receivables (`bridge/cash_out/rent_principal_collected`)
- The edge function is the sole source of truth for revenue

The trigger will be rewritten to:
- Keep the status filter (only process success/partial/agent statuses)
- Keep the rent_request lookup and proportional calculation
- **Remove** all three `platform/cash_in` inserts (rent_principal, access_fee, registration_fee)
- **Keep** the single `bridge/cash_out/rent_principal_collected` insert
- Replace the unreliable time-based guard with a deterministic check: `source_table = 'subscription_charge_logs' AND source_id = NEW.id::text AND ledger_scope = 'bridge'`

### 2. Remove any leftover manual balance math in auto-charge-wallets

Verify and remove any `const newBalance = walletBalance - chargeAmount` or similar lines. The wallet trigger (`sync_wallet_from_ledger`) handles all balance updates. (Search confirmed these are already removed — this is a verification step.)

## Files Changed

| File | Change |
|------|--------|
| 1 database migration | Rewrite `sync_collection_to_ledger`: remove platform revenue inserts, keep bridge receivable reduction, replace time-based guard with deterministic idempotency |
| No edge function changes | Already correct |

## After This

- Revenue comes from exactly ONE source (edge function RPC)
- Bridge receivables reduce via trigger (safe — no cash movement)
- No time-based guards anywhere
- Balance enforcement already exists in RPC (`total_in != total_out` → exception)

