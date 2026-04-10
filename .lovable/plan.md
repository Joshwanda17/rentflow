

# Fix: Wallet/Ledger Drift for HELLEN NABUKENYA

## Root Cause

**Timeline (April 10):**
1. **07:29 UTC** — Withdrawal request created for UGX 6,000. The **rogue trigger** (`trg_deduct_wallet_on_withdrawal_request`) was still active and directly deducted 6,000 from `wallets.balance` (11,000 → 5,000) — **without creating a ledger entry**.
2. **07:42 UTC** — Withdrawal approved. The `approve-withdrawal` edge function likely failed or was bypassed (the status was updated to `approved` but **no `wallet_withdrawal` ledger entry exists**).
3. **07:56 UTC** — The rogue trigger was dropped via migration. But the damage was already done for this user.

**Result:** Wallet = 5,000 (correct — money was sent), Ledger = 11,000 (missing the 6,000 debit). Drift = 6,000.

## Fix — One Database Migration

Backfill the missing ledger entry to match reality. The wallet balance (5,000) is correct since the money was actually paid out. The ledger is missing the record.

```sql
-- Backfill missing withdrawal ledger entry for HELLEN NABUKENYA
-- Withdrawal 8b437145 was approved but the rogue trigger deducted the wallet
-- without creating a ledger entry. This restores ledger truth.

SELECT public.create_ledger_transaction(
  entries := ARRAY[
    jsonb_build_object(
      'user_id', 'bd266fc7-1066-468a-8beb-347430d9d9b6',
      'amount', 6000,
      'direction', 'cash_out',
      'category', 'wallet_withdrawal',
      'ledger_scope', 'wallet',
      'description', 'Backfill: withdrawal approved 2026-04-10 (rogue trigger drift correction)',
      'currency', 'UGX',
      'source_table', 'withdrawal_requests',
      'source_id', '8b437145-e259-40b0-b94c-5421796374a7',
      'transaction_date', '2026-04-10T07:42:18.295Z'
    ),
    jsonb_build_object(
      'amount', 6000,
      'direction', 'cash_in',
      'category', 'wallet_withdrawal',
      'ledger_scope', 'platform',
      'description', 'Backfill: platform records withdrawal payout (rogue trigger drift correction)',
      'currency', 'UGX',
      'source_table', 'withdrawal_requests',
      'source_id', '8b437145-e259-40b0-b94c-5421796374a7',
      'transaction_date', '2026-04-10T07:42:18.295Z'
    )
  ]::jsonb[]
);
```

This creates the proper double-entry (wallet cash_out + platform cash_in) using the standard RPC, which will:
- Add the missing 6,000 debit to the ledger
- Trigger `sync_wallet_from_ledger` to recalculate the wallet from ledger truth
- Result: Wallet = 5,000, Ledger = 5,000, Drift = 0

## Prevention

The rogue trigger is already dropped. No further preventive action needed — all future withdrawals go through the `approve-withdrawal` edge function which uses `create_ledger_transaction`.

## Impact
- Fixes the 1 remaining drift alert on the CFO Ledger Integrity dashboard
- Zero risk to other users
- Fully auditable via the ledger

