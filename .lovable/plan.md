

# Add "Angel Shares" Tab to My Support Accounts Sheet

## What Changes

The existing **"My Support Accounts"** bottom sheet (`InvestmentBreakdownSheet.tsx`) will be upgraded with two tabs:
- **Support Accounts** — the current content (no changes)
- **Angel Shares** — a new investor-grade shareholding overview

## Angel Shares Tab Content

### Hero Card (dark gradient)
- Total shares held (large number)
- Total capital invested in UGX
- Pool ownership % (shares / 25,000 x 100)
- Company ownership % (shares / 25,000 x 8)
- "Verified Shareholder" badge

### Valuation Projections
Three cards showing estimated value of holdings at $1B, $3B, $5B company valuations using existing constants (`VALUATIONS`, `UGX_PER_USD`).

### Investment History
Chronological list of individual angel pool investment records — date, amount, shares acquired, reference ID, and status badge. Sorted newest first.

## Technical Plan

### 1. Create `src/hooks/useMyAngelShares.ts`
- Query `angel_pool_investments` filtered by current user ID
- Separate confirmed vs pending investments
- Aggregate totals: shares, amount, pool %, company %
- Return individual records for history list

### 2. Create `src/components/supporter/AngelSharesTab.tsx`
- Self-contained component consuming the hook
- Renders hero card, valuation grid, and history list
- Shows empty state if user has no angel shares

### 3. Modify `src/components/supporter/InvestmentBreakdownSheet.tsx`
- Add `Tabs` component (using existing `underline` variant) below the sheet header
- Two tabs: "Support Accounts" and "Angel Shares"
- Current sheet body becomes the "Support Accounts" tab content
- "Angel Shares" tab renders the new `AngelSharesTab` component
- Summary stats row stays tab-specific (each tab shows its own summary)

### Files
| Action | File |
|--------|------|
| Create | `src/hooks/useMyAngelShares.ts` |
| Create | `src/components/supporter/AngelSharesTab.tsx` |
| Modify | `src/components/supporter/InvestmentBreakdownSheet.tsx` |

