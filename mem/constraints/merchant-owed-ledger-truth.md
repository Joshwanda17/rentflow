---
name: Merchant owed is ledger-derived only
description: owed_to_agent in get_merchant_float_positions comes from negative ledger float plus explicitly confirmed out-of-pocket claims — never lifetime paid-out minus float credits
type: constraint
---
`get_merchant_float_positions()` (corrected 2026-08-19):

- `owed_to_agent = GREATEST(0, -float_balance_raw) + confirmed_oop`, where `confirmed_oop` is
  `merchant_out_of_pocket_advances` with `status='pending_reimbursement'` and `reimbursed_at IS NULL`.
  NEVER `paid_out_total - float_credits_recorded` — that differential produced a false
  UGX 88,203,296 platform liability.
- `paid_out_total` counts only `payout_method='mobile_money'` completed withdrawals (bank transfers
  never consume a merchant's phone float) and attributes each withdrawal to exactly ONE desk
  (assigned desk first, else the processing agent's desk) — the old OR-join double counted 10 payouts.
- `payouts_without_float_evidence` counts confirmed out-of-pocket claims only, not
  `merchant_payout_funding` auto-classifications (`classified_via='reconciler'` inflated it to ~260m).

An out-of-pocket claim may only sit in `pending_reimbursement` if a merchant attested it
(`attested_at`) or Financial Ops reviewed it (`reviewed_at`). Auto-promoted rows with neither were
returned to `needs_review` on 2026-08-19 (audit action `merchant_oop_ledger_correction`).
No wallet or ledger writes anywhere in this path.
