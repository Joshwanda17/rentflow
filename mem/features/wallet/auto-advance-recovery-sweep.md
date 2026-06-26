---
name: Auto advance recovery sweep
description: sweep_agent_advance_recovery runs every 15 min, auto-debiting agent withdrawable into outstanding advances (FIFO, no interest) until settled
type: feature
---
**Rule.** Whenever an agent has withdrawable funds AND an outstanding advance, the
system auto-debits withdrawable toward the advance until it is settled — not just
once a day.

**`public.sweep_agent_advance_recovery()`** (SECURITY DEFINER, search_path=public,
EXECUTE granted to service_role only):
- For each agent with `agent_advances.status in ('active','overdue')` and
  `outstanding_balance > 0`, reads STRICT withdrawable via
  `get_user_available_balance(agent_id)` (NEVER `wallets.balance`; float/commission
  custody is untouchable).
- Sweeps FIFO across that agent's advances (oldest `issued_at` first), deducting
  `min(available, outstanding)` per advance via `create_ledger_transaction` with
  Wallet Routing v2 tags (wallet leg `recipient_type='user'`, platform leg
  `recipient_type='operational_wallet'`, category `agent_repayment`,
  `metadata.source='auto_withdrawable_sweep'`, `bucket_intent='advance_balance_recovery'`).
- Records each recovery in `agent_advance_ledger` with `interest_accrued=0`
  (recovery-only; interest stays on the existing daily cron
  `process-agent-advance-deductions`). Updates `outstanding_balance`, `status`
  (→`completed` at 0), `access_fee_collected`/`access_fee_status`.

**Scheduled** via pg_cron job `sweep-agent-advance-recovery` every 15 min
(`*/15 * * * *`).

**Why no `system_events` insert.** `system_events` has NO `payload` column and its
`event_type` enum has no `repayment_*` values — the existing edge function's event
inserts silently fail (swallowed). The general_ledger + agent_advance_ledger rows
are the audit trail of record for this recovery. Do not add a system_events insert
here without first adding the enum values + using the `metadata` column.

**Do not.** Do not add interest in this sweep (double-counts the daily cron). Do not
read `wallets.balance`. Do not touch float/commission buckets.