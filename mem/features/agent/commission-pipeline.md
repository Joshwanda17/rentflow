---
name: Agent rent commission pipeline
description: Sole producer of agent rent commission is auto-charge-wallets edge fn driven by pg_cron job auto-charge-wallets-daily. If the cron is inactive, ALL agent rent commissions silently stop. credit_agent_rent_commission posts via create_ledger_transaction with recipient_type=user and category=agent_commission_earned.
type: feature
---

# Agent rent commission pipeline

## Path

1. Tenant has `subscription_charges` row (created on rent approval).
2. pg_cron `auto-charge-wallets-daily` (06:00) → edge fn `auto-charge-wallets`.
3. Per due charge: debit tenant wallet → RPC `credit_agent_rent_commission(rent_request_id, repayment_amount, tenant_id, event_reference_id)`.
4. RPC posts via `create_ledger_transaction` with `recipient_type='user'`, `category='agent_commission_earned'`, `ledger_scope='wallet'`. Routing → `withdrawable_balance`.
5. Splits 10%: manager 10% solo, or 8% mgr + 2% recruiter / 2% source + 8% mgr / 2% src + 8% mgr + 2% recruiter for sub-agent chains.

## Fragility: cron outage = silent stoppage

No other producer of `agent_commission_earned` from rent repayments. If `auto-charge-wallets-daily` flips to `active=false` (project pause, manual disable, etc.), commissions freeze with no error surface.

## Detection

CFO → Reconcile tab → "Scheduled Jobs Health" panel. Component `CronJobsHealthPanel`, RPC `cron_jobs_health()`. `is_stale=true` when `active=false` OR `last_run_at IS NULL` OR `last_run_at < now() - 24h`.

## Recovery

```sql
SELECT cron.alter_job(job_id := jobid, active := true)
  FROM cron.job
 WHERE jobname IN ('auto-charge-wallets-daily','daily-credit-charges','retry-no-smartphone-charges-3h');
```

Then POST once to `auto-charge-wallets` to drain backlog (idempotent per `next_charge_date`).

## 2026-05-11 incident

All three crons `active=false`. 6 active subscriptions stuck at `next_charge_date=2026-04-16` (~25 days). Platform-wide commission produced since 2026-04-01: 2 rows / 3,000 UGX. Re-enabled + drained: 6 charges processed, 387,563 UGX catch-up debt accrued.
