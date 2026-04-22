

## Process Akampurira Onesmus's UGX 281,000 Withdrawal

You've decided the CFO retractions were correct AND now want to process the withdrawal anyway. To do this safely, I need to **first credit real money back into his withdrawable bucket** via a balanced ledger entry, then approve the withdrawal so it pays out and posts the standard cash-out legs.

### What I'll do

**Step 1 — Reopen the rejected request**
Withdrawal `5b928ff5` was marked `rejected` earlier. Flip it back to `pending` so the standard `approve-withdrawal` pipeline can process it.

**Step 2 — Credit UGX 281,000 to his withdrawable bucket (manager override)**
Post a balanced ledger pair via `create_ledger_transaction`:

```text
Leg A: cash_in  / manual_credit  / scope=wallet    / user=Akampurira  / +281,000
Leg B: cash_out / manual_credit  / scope=platform  /                  / -281,000
```

- Category: `manual_credit` (allowlisted, used for CFO/manager top-ups).
- Description: `Manager override — fund approved withdrawal 5b928ff5 after CFO retraction reconciliation`.
- Then run `recompute_wallet_buckets(<user_id>)` so `withdrawable_balance` reflects the credit.

**Step 3 — Approve the withdrawal through the normal pipeline**
Set `withdrawal_requests.5b928ff5` → `status='approved'`, `approved_by=<current admin>`, `approved_at=now()`, `rejection_reason=NULL`. The existing `approve-withdrawal` triggers will post the standard cash-out legs (`withdrawal` category, wallet→platform), decrement the withdrawable bucket back to 0, and queue the payout.

**Step 4 — Audit trail**
Insert into `audit_logs`:
- `action_type = 'withdrawal_force_approved_after_retraction'`
- `record_id = 5b928ff5...`
- `metadata`: previous CFO retraction total (3,191,100), manual credit amount (281,000), reason ("Operator approved payout despite negative ledger; manual credit posted to make whole").

### Net effect on the books

| Bucket | Before | After credit | After withdrawal |
|---|---|---|---|
| Withdrawable | 0 | 281,000 | 0 |
| Float (phantom) | 1,908,200 | 1,908,200 | 1,908,200 |
| Ledger net | -707,500 | -426,500 | -707,500 |

The phantom float drift remains — that's a separate wallet-repair task. This plan only handles the one withdrawal you've authorized.

### Risk callout

You earlier confirmed the CFO retractions were correct, meaning Akampurira's real entitlement is UGX 0. Approving this withdrawal means **Welile is paying UGX 281,000 of platform cash to a user whose ledger shows no balance**. The `manual_credit` posting makes this auditable — it's a deliberate operator override, not a bug. If you'd rather not take that loss, say so and I'll stop after Step 1.

