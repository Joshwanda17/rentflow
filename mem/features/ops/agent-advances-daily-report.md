---
name: Agent Advances Daily Report
description: Scheduled 18:00 EAT email report focused on the agent credit-advance programme — adoption, request/approval/rejection flow vs system totals, rejection reasons, month trend, repayment health and overdue book
type: feature
---
Edge function `agent-advances-daily-report` emails a daily Agent Advances summary (distinct from the broader `agent-ops-daily-report`).

- **Recipients (fixed):** benjamin@welile.com, paphra.me@gmail.com (edit `REPORT_RECIPIENTS` in the function).
- **Schedule:** pg_cron `agent-advances-daily-report-1800-eat` at `0 15 * * *` (15:00 UTC = 18:00 EAT).
- **Data:** `agent_advance_requests` (all rows — flow + rejection reasons + month trend), `agent_advances` (portfolio active/overdue/completed + outstanding), `agent_advance_ledger` (`amount_deducted` = repayments), `user_roles` role=agent (total agents). Profiles read `phone` (not `phone_number`).
- **Metrics:** total agents, agents with advances + adoption %, new/approved/rejected/pending requests today vs all-time, rejection-reason buckets (today + all-time), new-requests-per-EAT-day trend for the month (today highlighted), repayment rate = totalRepaid/(totalRepaid+outstanding), repaid today/month/all-time, active/overdue/completed counts + outstanding, paying-back count (outstanding<principal), top-8 overdue agents.
- **Charts:** QuickChart images — month trend bar, outcome doughnut, portfolio doughnut, rejection-reasons horizontalBar.
- **Delivery:** enqueue_email -> transactional_emails -> process-email-queue (Lovable Emails), FROM `Welile Reports <info@welile.com>`, sender domain `notify.welile.com`; queue idempotency_key `agent-advances-daily-report:<date>:<to>`.
- **Idempotency/audit:** one `system_events` row (`event_type='agent_advances_daily_report'`, metadata.date EAT) per day; bypass with `{ force: true }`. NOTE: `system_events.event_type` is enum `system_event_type` — the value `agent_advances_daily_report` was added to the enum so the audit insert succeeds (the older `agent-ops-daily-report` uses `agent_ops_daily_report` which is NOT in the enum, so its audit insert silently fails).
- **Backfill:** POST `{ dates: [...], force: true }` or `{ date }`; defaults to today (EAT).

`isApproved` treats status containing `approved`/`disbursed`/`active`/`repaying` or a non-null `cfo_paid_at` as approved. Current request statuses in prod: `agent_ops_approved`, `rejected`, `pending`.
