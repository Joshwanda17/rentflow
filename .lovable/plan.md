
The user shows agent **Akampurira Onesmus** with Float = UGX 0 and Commission = UGX 1,732,000. They suspect his float money was wrongly reclassified as commission.

Per memory rules:
- **Float**: company money, locked, never withdrawable, used only for tenant rent operations
- **Commission**: agent's earned income, always withdrawable
- Categories must come from the strict allowlist; `agent_commission_earned` credits commission, float credits go through `agent_float_topup` / float allocation flows
- During the recovery window (2026-04-09 14:41–14:43), platform-side counter-legs were re-scoped — but per-wallet drift is 0, so user balances themselves weren't altered

I need to read-only investigate. Plan:

# Plan: Investigate Akampurira Onesmus's Float→Commission Suspicion

## Steps (all read-only SQL via supabase--read_query)

1. **Resolve the agent**
   - Look up `profiles` for "Akampurira Onesmus" → get `user_id`.
   - Pull current `wallets` row: `withdrawable_balance`, `float_balance`, `advance_balance`, `balance`, `updated_at`.

2. **Full ledger history for this user**
   - `SELECT created_at, category, direction, amount, source_table, transaction_group_id, metadata, ledger_scope FROM general_ledger WHERE user_id = <id> ORDER BY created_at`.
   - Bucket each entry by intended target (commission vs float vs advance) using category + metadata.

3. **Check for re-categorization events**
   - Look for any `agent_float_*` debit followed by an `agent_commission_*` credit with the same `transaction_group_id` or close timestamps.
   - Check if any of his rows fall inside the recovery window (2026-04-09 14:41–14:43) or were touched by the rescope migrations.

4. **Verify lifetime float vs commission totals**
   - Sum credits/debits per category family. Expected: Float credits − Float debits = 0; Commission credits − Commission debits = 1,732,000.
   - If Float lifetime credits > 0 but balance is 0, find where it went (allocations to tenants? withdrawals? wrong category?).

5. **Check tenant float allocations**
   - Per the agent-tenant-float-allocation memory: agents deposit lump sum to float, then allocate per-tenant which converts float→commission (10% instant). So **commission can legitimately come FROM float operations** via that RPC — but only the 10% slice, not the whole amount.
   - Sum `agent_commission_earned` entries that reference float allocation in metadata, and confirm they equal ~10% of corresponding float debits.

## What you'll get back

A short report:
- Akampurira's current 3-bucket state
- Lifetime float-in / float-out / commission-in / commission-out totals
- Whether the math is consistent with the legitimate "float allocation → 10% commission" flow
- **Verdict**: either (a) "his float was correctly drawn down by tenant allocations and the 1.73M commission is the legitimate 10% earned" — or (b) "anomaly: X UGX of float was mis-categorized as commission on [date] via [transaction_group_id]" with the exact rows to fix

No data changes in this step. If an anomaly is found, I'll come back with a targeted correction plan (paired contra-entries via `create_ledger_transaction`, never direct wallet writes).
