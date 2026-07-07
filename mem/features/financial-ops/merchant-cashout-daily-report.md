---
name: Merchant cash-out daily payout report
description: Automated 22:00 EAT email report of each merchant (cash-out) agent's payouts + commission, sent to fixed ops recipients from ledger-accurate figures
type: feature
---
Nightly at **22:00 EAT (19:00 UTC)** the `merchant-cashout-daily-report` edge function emails an accurate per-merchant cash-out payout report to **weliletenants@gmail.com** and **joshwanda17@gmail.com**.

**Accuracy source:** SECURITY DEFINER RPC `generate_merchant_cashout_daily_report(p_date date)` aggregates straight from `general_ledger` (never caches). Per merchant-settled cash payout `approve-withdrawal` posts a 0.5% commission leg (`reference '<wd>-cashout-commission'`, wallet cash_in `agent_commission_earned`) — the canonical per-payout marker (covers both float + legacy models) — plus a principal leg (`'<wd>-merchant-float-consume'` float model, or `'<wd>-merchant-reimbursement'` legacy). Principal = paired principal leg, fallback `commission * 200`. Day boundary anchored to `Africa/Kampala`. Returns `{date, merchant_count, total_payouts, total_paid, total_commission, summary[], detail[]}`.

**Email path:** enqueues raw HTML via `enqueue_email('transactional_emails', payload)` → `process-email-queue` → `sendLovableEmail`. Transactional sends REQUIRE `unsubscribe_token` (400 `missing_unsubscribe` otherwise) — the fn upserts one per recipient into `email_unsubscribe_tokens`. From `Welile Reports <info@welile.com>`, sender_domain `notify.welile.com`.

**Idempotency/audit:** one `system_events` row `event_type='merchant_cashout_daily_report'` per EAT day (skips duplicates unless POST body `{force:true}`); POST `{date:"YYYY-MM-DD"}` overrides the day. Cron job `merchant-cashout-daily-report-2200-eat`.
