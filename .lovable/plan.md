

# Advance Access Fee Receivables Tracking

## Current State

- `agent_advances` has no `access_fee` column — the fee is calculated client-side but never persisted
- The daily deduction function (`process-agent-advance-deductions`) compounds interest daily but doesn't separate principal from access fee
- The Balance Sheet receivables only track outstanding rent, not advance fees
- Financial statements don't account for advance access fee revenue at all

## What Changes

1. **Store the access fee** on each advance at issuance time
2. **Track how much of the access fee has been collected** via daily deductions
3. **Show receivables** on CFO dashboard and in financial statements
4. **Recognize revenue only when collected** — access fees start as receivables, become revenue proportionally as deductions occur

## Database Migration

Add columns to `agent_advances`:
```sql
ALTER TABLE agent_advances
  ADD COLUMN IF NOT EXISTS access_fee NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_fee_collected NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_fee_status TEXT DEFAULT 'unpaid'
    CHECK (access_fee_status IN ('unpaid', 'partial', 'settled'));
```

No new table needed — the advance itself is the receivable source record. The `agent_advance_ledger` already tracks daily deductions with enough granularity.

## File Changes

### `src/components/manager/IssueAdvanceSheet.tsx`
- On insert: store `access_fee: accessFee` (already calculated client-side)
- On top-up: recalculate and add incremental access fee

### `supabase/functions/process-agent-advance-deductions/index.ts`
- After each daily deduction, calculate the proportion of access fee collected:
  - `feeCollectionRatio = totalAmountDeducted / totalPayable`
  - `access_fee_collected = access_fee * feeCollectionRatio`
- Update `access_fee_collected` and `access_fee_status` on the advance record
- This ensures revenue is recognized proportionally as payments come in

### `src/components/cfo/CFOAdvancesManager.tsx`
- Add a new summary card: "Access Fee Receivables" showing total uncollected fees
- Add columns to the table: Access Fee, Collected, Outstanding Fee
- Color-code fee status (unpaid = red, partial = amber, settled = green)

### `src/hooks/useFinancialStatements.ts`
- **Balance Sheet**: Add `advanceAccessFeeReceivables` to assets — sum of `(access_fee - access_fee_collected)` for active/overdue advances
- **Income Statement**: Add `advanceAccessFeesCollected` as a revenue line — sum of `access_fee_collected` across all advances
- **Cash Flow**: Add advance access fee payments to operating cash inflows

### `src/components/cfo/CFOReceivablesTracker.tsx`
- Add a new section: "Advance Access Fee Receivables" below the existing rent receivables
- Show per-agent breakdown: agent name, advance ID, fee amount, collected, outstanding, status
- Summary KPIs: total fee receivables, collection rate percentage

### `src/components/manager/FinancialStatementsPanel.tsx`
- Update Income Statement display to show the new `advanceAccessFeesCollected` revenue line
- Update Balance Sheet display to show `advanceAccessFeeReceivables` under assets

## Revenue Recognition Flow

```text
Issue Advance → access_fee recorded as receivable (unpaid)
     ↓
Daily Deduction runs → deducts from wallet → proportional fee recognized
     ↓
access_fee_collected updated → status: partial
     ↓
Fully repaid → access_fee_status: settled → full revenue recognized
```

| Area | Change |
|---|---|
| Database | 3 new columns on `agent_advances` |
| IssueAdvanceSheet | Persist `access_fee` on issuance |
| Edge function | Track proportional fee collection per deduction |
| CFO Advances | Show fee receivables in summary + table |
| Receivables Tracker | New "Advance Access Fee" section |
| Financial Statements | Revenue line + balance sheet receivable + cash flow |
| Statements Panel | Display new lines in rendered reports |

