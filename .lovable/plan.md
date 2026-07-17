# Refund AUFU SEKABIRA's malformed advance deduction + notify

## Actions

1. **Void the malformed advance** (UGX 1 principal, "90d @ 33%" from 2026-07-16 12:57)
   - Mark the `agent_advances` row as `voided` with reason "malformed disbursement — principal UGX 1, resolved".
   - Insert a reversing `general_ledger` transaction for the UGX 10,098 `agent_repayment` deduction (2026-07-16 14:00): credit his wallet withdrawable, debit the advance recovery platform account. Category: `system_balance_correction`, classification: `admin_correction`, with reason referencing the original ledger tid.
   - Confirm no downstream `agent_advance_ledger` / `pending_wallet_operations` rows need cleanup; if present, mark them reversed.

2. **Send SMS to +256702280226** via `sendSmsMultiProvider` (omit sender, per SMS sender rule):
   > "Hello Aufu, we've refunded UGX 10,098 to your Welile wallet — the loan repayment was from a malformed UGX 1 advance and has been voided. Note: the UGX 2,000 deducted on 14 Jul was a listing rejection penalty and stands. Thank you. — Welile"

3. **Verify & report**
   - Re-query `wallets` + strict available balance for user, and the last 5 ledger rows.
   - Reply with his new withdrawable / float / total and confirmation the advance is voided and SMS delivered.

## Technical notes

- Use `supabase--insert` for the reversing ledger transaction via `create_ledger_transaction` RPC (raw JSON array, never stringified) and for the `agent_advances` status update.
- Reversing legs must balance (`cash_in == cash_out`); wallet leg uses `recipient_type='user'` so routing v2 pushes it to withdrawable.
- SMS via a one-off edge function call or direct provider call — omit `sender` field (Yoola default `ATInfo`).
- Do NOT touch the 2026-07-14 `listing_rejection_penalty` or the 2026-07-16 `registration_fee_collected` — those are valid.
