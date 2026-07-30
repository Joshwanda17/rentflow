---
name: Daily CTO Report
description: Executive daily technology report emailed 00:00 EAT via get_cto_daily_report RPC + daily-cto-report edge function
type: feature
---
- RPC `get_cto_daily_report(p_date)` (SECURITY DEFINER, search_path public+extensions) aggregates platform, errors, auth, security, infra, backups, cron jobs, email and slow queries. Slow queries read `extensions.pg_stat_statements` inside an exception-safe block.
- Edge fn `daily-cto-report` renders a 14-section HTML executive report (KPI cards, bar charts, risk heat map, compliance table, weighted 0-100 technology health score) and sends via Mailgun.
- Cron job `daily-cto-report` runs `0 21 * * *` UTC = 00:00 EAT; defaults to the day just ended.
- Default recipient: joshwanda17@gmail.com. Override with POST body `{ "date": "YYYY-MM-DD", "recipients": [...] }`.
