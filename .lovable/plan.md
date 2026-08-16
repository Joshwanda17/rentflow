# Phase 2 — Void the 15 duplicate-reversal ledger legs (UGX 32,810,000)

Scope fence: these 15 legs only. No wallet cache write, no new correction categories, no touching the
101 UNKNOWN_NEEDS_REVIEW legs, no change to `apply_wallet_movement`, no reporting-surface changes.

## Confirmed target set (re-verified just now)

All 15 legs share the exact same signature: `ledger_scope='wallet'`, `wallet_bucket='float'`,
`direction='cash_out'`, `classification='admin_correction'`, `category='system_balance_correction'`,
`created_at = 2026-08-14 14:06:34.380038+00`, description starting
`Balance effect: historical merchant float sweep credit settled back`.

They are the second wave of a reversal that had already been posted three minutes earlier at
14:03:55 as `agent_float_deposit` cash_out. That first wave is the legitimate reversal; this second
wave debited the same money a second time.

| Desk | Amount (UGX) | Leg id |
|---|---|---|
| Bayo Mercy | 5,000,000 | 4def02f0 |
| Hilary Evanz | 5,000,000 | 842259c8 |
| Tugabirwe Apophia | 5,000,000 | 9d6c61be |
| NABBALE CLAIRE | 3,000,000 | 9281bf43 |
| Nankambo sharimah | 3,000,000 | 5ac98738 |
| Babrah Tusingwire | 2,000,000 | 3c820f77 |
| Catherine Nabaggala | 2,000,000 | 7c2a6883 |
| Hilary Evanz | 2,000,000 | 6ca49532 |
| NABBALE CLAIRE | 2,000,000 | cd46c822 |
| JOSHUA WANDA | 1,200,000 | def7109f |
| JOSHUA WANDA | 1,000,000 | de4ce602 |
| JOSHUA WANDA | 950,000 | cb65d81b |
| Bayo Mercy | 500,000 | aad29706 |
| Bayo Mercy | 110,000 | 87309178 |
| Bayo Mercy | 50,000 | 34b6e86a |
| **Total** | **32,810,000** | 15 legs, 8 desks |

## Method

Append-only. No `UPDATE`, no `DELETE` on `general_ledger` — the ledger stays immutable.

For each of the 15 legs, one call to `create_ledger_transaction` posting a balanced pair:

- wallet leg: `cash_in`, `wallet_bucket='float'`, `recipient_type='operational_wallet'`,
  `category='system_balance_correction'`, `classification='admin_correction'`
- platform leg: `cash_out`, `category='phantom_writedown_clearing'`

Idempotency key per leg: `phase2-void-<leg_id>`. Re-running the migration posts nothing.
Description on each names the voided leg id and the reason, so the audit trail is self-explaining.
One `audit_logs` row (`action_type='ledger_duplicate_reversal_void'`) with the reason and the 15 ids.

The whole thing runs as a single transaction with `SET LOCAL lock_timeout = '5s'`.

## Expected effect — raw ledger net moves to match the cache

| Desk | Raw net before | Void | Raw net after | Cache shown |
|---|---|---|---|---|
| Tugabirwe Apophia | −4,353,043 | +5,000,000 | 646,957 | 646,957 |
| Hilary Evanz | −5,152,101 | +7,000,000 | 1,847,899 | 1,847,899 |
| NABBALE CLAIRE | −3,854,703 | +5,000,000 | 1,145,297 | 1,145,297 |
| Babrah Tusingwire | −44,114 | +2,000,000 | 1,955,886 | 1,955,886 |
| All 12 desks | −53,871,729 | +32,810,000 | −21,061,729 | — |

Four desks reach exact cache identity. The residual −21,061,729 is the UNKNOWN_NEEDS_REVIEW
population and stays untouched and visible — it is not absorbed or plugged.

**The wallet cache will not move.** `v_user_wallet_strict` does not admit `admin_correction`
`system_balance_correction` **cash_in** legs (deliberate rule — credits of that shape are filtered,
debits pass). So this restores the books without crediting anyone. That is the intended outcome:
the cache was already right on these desks.

## The four verification checks (run after, reported back)

1. **Count and sum**: exactly 15 idempotency keys `phase2-void-%` exist, 30 new rows, total
   32,810,000 on each side.
2. **Group balance**: every new `transaction_group_id` nets to zero (cash_in = cash_out); the
   existing `ledger_group_balance_regression` invariant still passes globally.
3. **Per-desk raw net**: the four desks above equal their cached float to the shilling; all 12 desks
   reconcile to the predicted table.
4. **Cache untouched**: `wallets` float_balance for all 12 desks is byte-identical to the
   pre-migration snapshot, and `get_merchant_float_positions()` headline evidenced figure is
   unchanged at UGX 15,000.

## What is explicitly NOT in this phase

- The silent clamp in `apply_wallet_movement` (root cause) — separate remediation step.
- The `display_only` defect in `trg_stamp_merchant_reconciliation_truth`.
- The 13.7M Bayo Mercy Equity account (still UNTRACED).
- Mudumba samuel's 2,208,633 (NO INDEPENDENT EVIDENCE — needs provider confirmation).
