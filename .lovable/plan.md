

## Investigation Results: Cron Job is BROKEN

### Findings

**Two cron jobs exist for agent advance deductions — both DISABLED:**

| Job ID | Name | Schedule | Status |
|--------|------|----------|--------|
| 13 | `process-agent-advance-deductions-daily` | `0 5 * * *` (5:00 UTC daily) | ❌ **inactive** |
| 23 | `daily-advance-deductions` | `0 4 * * *` (4:00 UTC daily) | ❌ **inactive** |

Both call `process-agent-advance-deductions` edge function, but `cron.job.active = false`, so neither fires.

**Evidence of impact:**
- Last entry in `agent_advance_ledger`: **2026-04-17** (3 days ago)
- Only **13 entries in the last 7 days** (should be ~21 if 3 advances × 7 days)
- **3 active advances** with **UGX 3,298,194 outstanding** — currently accruing zero interest and zero deductions
- Edge function logs for `process-agent-advance-deductions` show no recent invocations

**Root cause:** Both jobs were disabled (likely during the duplicate-job cleanup — having two jobs at 4:00 and 5:00 UTC pointing at the same function would have caused double-deductions, so someone disabled them but never re-enabled one).

The edge function itself (`supabase/functions/process-agent-advance-deductions/index.ts`) is intact and correct: it computes daily compound interest from `monthly_rate`, deducts via `create_ledger_transaction`, and writes to `agent_advance_ledger` with idempotency protection (won't double-charge same day).

### Fix Plan

**Single migration to:**

1. **Unschedule** the duplicate job `process-agent-advance-deductions-daily` (jobid 13) — keep only one
2. **Re-enable** `daily-advance-deductions` (jobid 23) at `0 4 * * *` UTC (7:00 AM EAT — matches the documented `debt-repayment-automation` rule of "daily 7:00 AM cron deductions")
3. **Backfill catch-up**: trigger the edge function once immediately after re-enabling, so the 3 missed days get processed (the function's idempotency guard means it will only insert one ledger row per advance per day — so a single invocation today catches up today's deduction; the 3 missed days from Apr 18, 19, 20 will be permanently lost as missed accrual unless we explicitly backfill)

### Question for you on backfill

The function only processes **today's** deduction per run. The 3 missed days (Apr 18, 19, 20) won't auto-recover.

**Out of scope for this fix** — would require either:
- (a) a one-off backfill script that loops 3 days, OR
- (b) accepting the lost interest as goodwill to agents

I'll re-enable the cron and trigger today's run. If you want the 3 missed days backfilled, say so and I'll add a one-off backfill step.

### Files to touch
- New migration: re-enable cron job 23, drop duplicate cron job 13
- One-time edge function invocation post-migration to process today's deductions

### Out of scope
- Modifying the edge function logic (it works correctly)
- Backfilling missed days (pending your call)
- Touching the unrelated `business-advance-daily-compounding` job (jobid 28, currently active and healthy)

