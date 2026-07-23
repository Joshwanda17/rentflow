# Agent Advances Daily Report — Restructure & Schedule

Rebuild the existing `agent-advances-daily-report` edge function so its email matches the exact 4-section structure you asked for, then run it once today and confirm the 18:00 EAT cron.

**Recipients:** benjamin@welile.com, paphra.me@gmail.com
**Schedule:** pg_cron `agent-advances-daily-report-1800-eat` at `0 15 * * *` UTC (already in place — will verify).
**Sender:** `Welile Reports <info@welile.com>` via existing Lovable Emails queue.

## Email structure (in order)

### 1. Receivables projection (next 1 / 7 / 30 / 60 / 90 days)
For every active/repaying `agent_advances` row, project the scheduled `daily_installment` forward against `outstanding_balance` and split each future day's payment into **principal vs interest** using the effective daily rate implied by `access_fee / cycle_days` on the advance.
Table (fixed-width, no overflow):

```text
Window   Principal due   Interest due   Total receivable   # advances contributing
1 day    …               …              …                  …
7 days   …               …              …                  …
30 days  …               …              …                  …
60 days  …               …              …                  …
90 days  …               …              …                  …
```

Plus a stacked bar chart (QuickChart) of Principal vs Interest per window.

### 2. Programme summary
- **a) Adoption rate** — `agents_with_advance / qualifying_agents` (%), plus raw counts, month-over-month delta.
- **b) Agent base breakdown** — using `agent_ops_qualifying_agent_ids()` as the canonical set:
  - Total users (auth.users)
  - Qualifying agents (total)
  - Split by criterion met: has active sub-agent / posted promissory note / rent request on behalf / rent collection from tenant / listed ≥1 house (a single agent can appear in multiple buckets).
  - Doughnut chart of criteria distribution.
- **c) How agents qualify for advance** — explain the tier rule and show the fleet distribution.
  - **Limit-engine tweak:** shift the primary weight to **active sub-agent count** (following the "who is an agent" definition — a sub-agent counts as active only if they themselves qualify). Draft tiering:

    ```text
    Active sub-agents   Advance limit (UGX)
    0                   50,000    (starter, only if any other qualifying activity)
    1–2                 200,000
    3–5                 500,000
    6–10                1,500,000
    11–20               5,000,000
    21+                 10,000,000
    ```

    Other signals (rent collections, listings, promissory notes) act as multipliers/floors, not the primary driver. Report shows how many agents sit in each tier today.
- **d) Request flow** — Today vs Month-to-date:
  - Received / Approved / Rejected counts (today | MTD).
  - Top rejection reasons (today + MTD), from `agent_advance_requests.rejection_reason` / metadata.
  - Horizontal bar chart of rejection reasons.

### 3. Repayment trend
- Repaid today: total UGX + unique agents paying.
- Today vs same weekday last month.
- MTD repayments vs previous month same-window.
- Line chart: daily repayments this month overlaid on last month.

### 4. Arrears & advance demand
- **Arrears table** — every agent with `arrears_balance > 0`: name, phone, arrears UGX, days in arrears (from oldest unpaid scheduled day), outstanding balance. Sorted by arrears desc, top 25 in email, "…and N more" footer.
- Total arrears volume + count of agents.
- **Reasons for requesting advances** — bucket `agent_advance_requests.purpose` / `reason` field into top categories with counts (MTD).

## Technical notes
- Function: `supabase/functions/agent-advances-daily-report/index.ts` (rewrite body + queries; keep name so existing cron keeps firing).
- New RPCs (SECURITY DEFINER, `search_path=public`) to keep the edge fn thin:
  - `report_agent_advance_receivables(as_of date)` → returns rows for the 1/7/30/60/90 windows with principal & interest split.
  - `report_agent_advance_summary(as_of date)` → adoption, base breakdown, tier distribution, request flow, rejection reasons.
  - `report_agent_advance_repayments(as_of date)` → today/MTD/prior-month comparisons + daily series.
  - `report_agent_advance_arrears()` → arrears roster + reason buckets.
- Charts via QuickChart image URLs (same pattern as current function).
- Idempotency: keep `system_events` audit row per EAT date; `{ force: true }` to re-send.
- Cron: verify `agent-advances-daily-report-1800-eat` exists and is unpaused; recreate if missing.
- Manual send today: invoke the function with `{ force: true }` after deploy.

## Deliverables (on approval)
1. New RPCs migration.
2. Rewritten edge function.
3. Small tweak to `calculate_agent_advance_limit` (or equivalent) to weight active sub-agent count as primary driver — kept behind the same public signature so existing callers keep working.
4. Manual invocation to send today's report to both addresses.
5. Confirmation that the 18:00 EAT cron is scheduled.
