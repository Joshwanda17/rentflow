---
name: Agent Growth Daily Report
description: Morning cron email of the Agent Growth Leaderboard as a branded PDF attachment (Gmail connector), mirroring the executive Export PDF
type: feature
---
Edge function `agent-growth-daily-report` emails the Agent Growth Leaderboard PDF.

- **Recipients (fixed):** benjamin@welile.com, pexpert46@gmail.com
- **Schedule:** pg_cron `agent-growth-daily-report-0700-eat` at `0 4 * * *` (04:00 UTC = 07:00 EAT).
- **Data:** `get_agent_leaderboard_stats(p_period)`; default period `monthly` (matches leaderboard default view). Configurable via body `{ period }`.
- **PDF:** server-side jsPDF + jspdf-autotable port of `src/lib/agentGrowthReportPdf.ts` (header band, 8 KPI cards, Executive Summary insight box, Growth-by-Period table, Top Recruiters, Invitee Pipeline). Keep the two generators in sync.
- **Delivery:** Gmail connector (`GOOGLE_MAIL_API_KEY` + `LOVABLE_API_KEY`) via `messages/send` with a multipart/mixed MIME body so the PDF rides as a real ATTACHMENT. The Lovable email queue (`sendLovableEmail`) cannot carry attachments — do not route this through it.
- **Idempotency:** one `system_events` row (`event_type='agent_growth_daily_report'`, metadata.date EAT) per day; bypass with `{ force: true }`.

Frontend Export PDF button lives in `AgentLeaderboardPanel.tsx` → `generateAgentGrowthReportPdf`; it now also passes `inviteeStatus` counts.
