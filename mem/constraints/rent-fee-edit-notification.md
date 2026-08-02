---
name: Rent fee edit notification (anti-fraud)
description: Every admin edit to a tenant's rent fees/term must be logged and alerted by email+SMS to the pinned finance recipients
type: constraint
---
Any change to `rent_requests` fields `rent_amount`, `duration_days`, `access_fee`, `request_fee`, `total_repayment`, `daily_repayment` MUST be captured by the DB trigger `trg_log_rent_amount_change` → `log_rent_amount_change()` into `rent_amount_change_log` (with `changed_fields`), then reported by the `rent-amount-change-notify` edge function via email + SMS to the recipients in `finance_anomaly_alert_config` (joshwanda17@gmail.com / +256704825473).

Admins MAY edit rent fees; they may NEVER do it silently. If a correction is applied out-of-band (SQL/insert tool, `auth.uid()` null), you must still insert the `rent_amount_change_log` row and invoke `rent-amount-change-notify` in the same turn.

**Why:** prevents rent repayment fraud through unnoticed fee/term edits.
