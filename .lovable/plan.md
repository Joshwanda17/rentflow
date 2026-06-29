# Advance recovery: percentage-based, once daily

## Problem
The advance recovery job (`sweep_agent_advance_recovery`, currently scheduled every 15 minutes) deducts the agent's **entire** available withdrawable balance — i.e. their whole commission — toward outstanding advances:

```text
v_deduct := LEAST(v_avail, outstanding_balance)   -- takes everything available
```

This leaves agents with nothing to withdraw until the advance is fully cleared.

## Desired behaviour
- Recover only a **percentage** of the agent's available commission (default **10%**), leaving the rest withdrawable.
- The percentage is **CFO-adjustable** from the advance settings panel.
- The job runs **once per day** (not every 15 minutes).

## Changes

### 1. Database (migration)
- Add `daily_recovery_rate numeric NOT NULL DEFAULT 0.10` to `advance_fee_config` (the single-row config table that already holds the fee rates). A validation trigger (or simple bounds in the rewritten function) keeps it within 0.01–1.00.
- Rewrite `sweep_agent_advance_recovery()`:
  - Read the configured rate: `v_rate := COALESCE((SELECT daily_recovery_rate FROM advance_fee_config LIMIT 1), 0.10)`.
  - Per agent, compute the daily recovery cap from available withdrawable commission:
    `v_cap := round(get_user_available_balance(agent) * v_rate)`.
  - Deduct FIFO (oldest advance first) **up to `v_cap`** instead of up to the full available balance:
    `v_deduct := LEAST(v_remaining_cap, outstanding_balance)`, decrementing `v_remaining_cap` as each advance is paid.
  - Keep all existing double-entry ledger posting, Wallet Routing v2 tags, idempotency keys, `agent_advances` status/fee updates, and `agent_advance_ledger` logging exactly as-is — only the amount taken changes.
  - Include the configured rate in the returned JSON summary for observability.
- Reschedule the cron job from `*/15 * * * *` to once daily. To align with the existing ~7:00 AM Kampala (UTC+3) debt cycle, schedule at `0 4 * * *` (04:00 UTC = 07:00 EAT): unschedule `sweep-agent-advance-recovery`, re-create it with the daily expression.
- Do **not** run an immediate full settle on migration (the old migration ended with a full sweep). At most run one capped sweep so no agent is over-drained.

### 2. CFO UI (`src/components/cfo/CFOAdvancesManager.tsx`)
- Add a small "Daily recovery rate" settings control to the advances manager: shows the current percentage and lets the CFO set a new value (e.g. a number input + Save, validated 1–100%).
- On save, update `advance_fee_config.daily_recovery_rate` (store as a fraction, e.g. 10% → 0.10) and write an `audit_logs` entry with `action_type`, `table_name='advance_fee_config'`, the record id, and a ≥10-char reason, per audit governance.
- Show a one-line explainer: "Each day the recovery job takes this % of an agent's withdrawable commission toward their outstanding advance; the rest stays withdrawable."

## Technical notes
- Base of the percentage = the agent's strict available withdrawable balance from `get_user_available_balance` (commission lands in the withdrawable bucket), consistent with the existing strict-withdrawable rule. Float and advance custody remain untouched.
- Switching to once-daily means the 10% is applied a single time per day, so it can never compound down to near-zero across many runs.
- No changes to advance issuance, fee calculation, or repayment ledger categories.

## Verification
- Run the migration, then call `select public.sweep_agent_advance_recovery();` and confirm the returned `recovered_total` ≈ 10% of eligible agents' withdrawable balances, and that `agent_advance_ledger` rows show partial (not full) daily deductions.
- Confirm `cron.job` lists `sweep-agent-advance-recovery` with the daily schedule.
- In the CFO advances panel, change the rate, save, re-read `advance_fee_config`, and confirm the audit log entry.
