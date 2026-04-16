

# Add "Withdrawals" Tab to Partner Operations Dashboard

## Problem
Completed partner payouts are buried inside the Portfolios tab (via COOPartnersPage). Partners Ops staff must navigate into Portfolios → tap "Partner Withdrawals" card to see them. This makes tracking payout completion harder than it should be.

## What Changes

Add a **"Withdrawals"** tab to the Partner Operations tab bar that combines both views:
1. The existing **pending queue** (`PartnerOpsWithdrawalQueue` — currently shown above the tabs as section D)
2. The **completed/approved list** (`ApprovedPartnerWithdrawals` — currently hidden inside Portfolios)

This gives Partner Ops a single tab with full withdrawal lifecycle visibility.

## Steps

### 1. Add `'withdrawals'` tab to `PartnersOpsDashboard.tsx`
- Extend `Tab` type: `'portfolios' | 'capital' | 'roi' | 'topups' | 'activity' | 'promissory' | 'withdrawals'`
- Add to `tabs` array: `{ key: 'withdrawals', label: 'Withdrawals', icon: Banknote }`

### 2. Move the withdrawal queue into the tab content
- Remove `<PartnerOpsWithdrawalQueue />` from its current always-visible position (line 212)
- In `renderTabContent()`, add a `case 'withdrawals'` that renders both:
  - `<PartnerOpsWithdrawalQueue />` (pending approvals at top)
  - `<ApprovedPartnerWithdrawals onBack={() => setTab('portfolios')} />` (completed payouts below)
- Wrap both in a single `<div className="space-y-4">` so they stack cleanly

### 3. Remove the "Partner Withdrawals" card from COOPartnersPage
- Remove the `showApprovedWithdrawals` state toggle and the `SummaryCard` button (lines ~1505-1544) since this view now lives in its own dedicated tab — no need to duplicate it

**Files modified:** 
- `src/components/executive/PartnersOpsDashboard.tsx`
- `src/components/coo/COOPartnersPage.tsx` (remove duplicate entry point)

