

# CFO Dashboard Data Accuracy Fixes

## What's broken and why

1. **Revenue & Cash Flow by Purpose = all zeros**: Queries use `.eq('scope', 'platform')` but the column is `ledger_scope`. Returns empty data.
2. **Channel Balance Tracker shows zero withdrawals**: Filters by `status = 'completed'` but that status doesn't exist. Real statuses are `approved`, `fin_ops_approved`, `manager_approved`, `rejected`.
3. **Null providers mapped to Cash**: Inflates Cash channel, makes it unreliable.

## What we'll do

### New file: `src/lib/ledgerConstants.ts`
Create shared constants to prevent future silent bugs:
```ts
export const LEDGER_SCOPE = {
  PLATFORM: 'platform',
  WALLET: 'wallet',
  BRIDGE: 'bridge',
} as const;

export const FINAL_WITHDRAWAL_STATUSES = ['approved', 'fin_ops_approved'];
```

### Fix 1: `src/hooks/useCFOOverviewData.ts`
- Lines 147-148: `.eq('scope', 'platform')` → `.eq('ledger_scope', LEDGER_SCOPE.PLATFORM)` and remove `as any` cast
- Lines 246-248: Same fix for the cashFlowByPurpose query
- Line 19 (channel balances query): Change `.eq('status', 'approved')` to `.in('status', FINAL_WITHDRAWAL_STATUSES)`
- Line 306: `mapProvider` — null provider returns `'Unassigned'` instead of `'Cash'`
- Add `'Unassigned'` to channels object initialization

### Fix 2: `src/components/cfo/ChannelBalanceTracker.tsx`
- Line 38: Change `.eq('status', 'completed')` to `.in('status', FINAL_WITHDRAWAL_STATUSES)`
- Add an `'Unassigned'` channel entry with a warning indicator
- When Unassigned channel has balance > 0, show a small alert badge for CFO attention

### Why channel balances stay on request tables (for now)
The `general_ledger` has no `channel` or `provider` column. Channel-level cash tracking requires the `deposit_requests.provider` and `withdrawal_requests.mobile_money_provider` fields. Migrating this to ledger requires a schema change (adding a `channel` column to `general_ledger`) — that's a separate, larger initiative.

## Files changed
1. `src/lib/ledgerConstants.ts` — new, shared constants
2. `src/hooks/useCFOOverviewData.ts` — fix column name, withdrawal statuses, null provider mapping
3. `src/components/cfo/ChannelBalanceTracker.tsx` — fix withdrawal status filter, add Unassigned channel with alert

