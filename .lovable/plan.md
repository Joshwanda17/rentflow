

# Add Adjustable Interest Rate on Advance Top-Up

## Problem
When the CFO tops up an existing advance, the rate is hardcoded at 33%. The CFO needs the ability to lower the rate for the top-up portion.

## Changes

### 1. `src/components/manager/IssueAdvanceSheet.tsx`
- Add a `rate` state variable, defaulting to `0.33` (33%)
- When `isTopUp` is true, show a rate selector dropdown with options: 33%, 30%, 25%, 20%, 15%, 10%
- Pass the custom rate to `calculateAccessFee`, `calculateTotalPayable`, `calculateDailyPayment`, and `calculateCompoundProjection` instead of using the hardcoded 0.33
- Store the chosen rate in the `agent_advance_topups` insert (new column) and use it for the access fee calculation on the top-up amount
- For new advances, also allow rate selection (defaulting to 33%)

### 2. `src/lib/agentAdvanceCalculations.ts`
- Update `calculateAccessFee`, `calculateTotalPayable`, `calculateDailyPayment`, and `calculateCompoundProjection` to accept an optional `monthlyRate` parameter (defaults to 0.33)
- This keeps backward compatibility while enabling variable rates

### 3. Database migration
- Add `monthly_rate` column (numeric, default 0.33) to `agent_advance_topups` table to record the rate used for each top-up
- Add `monthly_rate` column (numeric, default 0.33) to `agent_advances` table for new advances

### 4. Edge function: `process-agent-advance-deductions/index.ts`
- Read `daily_rate` (already stored on the advance) to use the advance-specific rate instead of the hardcoded 0.33

## Result
- CFO sees a rate dropdown (33% down to 10%) when topping up an advance
- The breakdown recalculates live as the rate changes
- The chosen rate is persisted for audit trail
- Daily deduction processing respects per-advance rates

