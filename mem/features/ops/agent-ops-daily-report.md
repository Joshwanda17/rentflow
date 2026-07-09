---
name: Agent Ops Daily Report
description: Scheduled daily email report of agent field activity (collections, deposits, advances) with charts to fixed ops recipients
type: feature
---
Edge function `agent-ops-daily-report` emails a daily Agent Ops summary.

- **Recipients (fixed):** benjamin@welile.com, paphra.me@gmail.com
- **Schedule:** pg_cron `agent-ops-daily-report-1800-eat` at `0 15 * * *` (15:00 UTC = 18:00 EAT).
- **Data:** `agent_collections`, `wallet_deposits`, `agent_advance_requests` for the EAT calendar day.
- **Content:** KPI grid (active agents, collections count/volume, deposits, advances pending/approved, avg per agent), charts rendered as images via QuickChart (hourly collections bar+line, activity-mix doughnut, top-agents bar), and per-agent breakdown table.
- **Delivery:** enqueue_email → transactional_emails queue → process-email-queue (Lovable Emails), FROM `Welile Reports <info@welile.com>`, sender domain `notify.welile.com`.
- **Idempotency:** one `system_events` row (`event_type='agent_ops_daily_report'`, metadata.date) per EAT day; bypass with `{ force: true }`.
- **Backfill:** POST `{ dates: ["YYYY-MM-DD", ...], force: true }` or `{ date }`; defaults to today (EAT).
