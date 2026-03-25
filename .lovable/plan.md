

## Pause Partner Auto-Payout

### What's happening now
The `process-supporter-roi` edge function runs daily (6:00 AM UTC via cron) and also has a manual trigger button in the manager dashboard (`SupporterROITrigger.tsx`). It credits 15% monthly ROI from the platform ledger to supporter wallets.

### Plan

**Phase 1 — Add a feature flag to gate the payout** (safe, reversible)

1. **Add `enablePartnerAutoPayout` flag** to `FeatureFlagsContext.tsx` — default: `false` (paused).

2. **Update `process-supporter-roi/index.ts`** — Add an early-exit check at the top of the function. Before processing any payouts, query a lightweight config source (e.g., a `system_settings` table row or simply return immediately with a "paused" message). The simplest approach: add a hardcoded `PAYOUT_PAUSED = true` constant at the top of the edge function that causes it to return `{ success: true, paused: true, message: "Partner auto-payout is currently paused" }` without processing anything.

3. **Update `SupporterROITrigger.tsx`** — Disable the manual "Process Supporter ROI" button and show a "Paused" badge instead of "Auto-pay enabled". This prevents managers from manually triggering payouts while the pause is active.

### What stays untouched
- The cron job schedule remains in place (no DB changes needed)
- All existing ledger entries, portfolios, and wallet data are unaffected
- The function still deploys and responds — it just short-circuits with a paused response
- `next_roi_due_date` values are preserved so payouts resume correctly when re-enabled

### Re-enabling
To resume, set `PAYOUT_PAUSED = false` in the edge function and flip the feature flag back. All due payouts will process on the next run.

