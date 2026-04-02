

# Fix COO Partner Portfolio Top-Up & Add Dedicated Nav Items

## Problem
1. **Top-up failure**: The COO's partner portfolio top-up dialog (`FundInvestmentAccountDialog`) calls the `manager-portfolio-topup` edge function, which returns "Failed to send a request to the Edge Function". This is likely a deployment issue — the function exists but may need redeployment. Additionally, the function already allows COO role access (line 44: `allowedRoles = ["coo", "manager", "cfo", "super_admin"]`), so the backend logic is correct.

2. **Missing dedicated nav**: There is no "Partner Top-ups" card or sidebar item in the COO, CFO, or Partner Ops dashboards, making the feature hard to discover.

## Root Cause Analysis
The edge function `manager-portfolio-topup` exists and its RBAC already includes COO. The "Failed to send a request" error is a client-side invocation or deployment issue. We need to:
- Ensure the function deploys correctly (trigger redeploy by touching the file)
- Add a `PendingPortfolioTopUps` view to the COO dashboard
- Add sidebar items for "Partner Top-ups" in COO, CFO, and Partner Ops

## Changes

### 1. Redeploy `manager-portfolio-topup` edge function
- Add a minor comment/whitespace change to `supabase/functions/manager-portfolio-topup/index.ts` to trigger redeployment

### 2. Add "Partner Top-ups" sidebar item to COO dashboard
**File: `src/components/layout/executiveSidebarConfig.ts`**
- Add `{ label: 'Partner Top-ups', icon: TrendingUp, id: 'partner-topups' }` to the COO Governance section
- Add `{ label: 'Partner Top-ups', icon: TrendingUp, id: 'partner-topups' }` to the CFO Finance section

### 3. Add "Partner Top-ups" tab content to COO dashboard
**File: `src/pages/coo/Dashboard.tsx`**
- Import `PendingPortfolioTopUps` from `@/components/cfo/PendingPortfolioTopUps`
- Add a `case 'partner-topups'` that renders the `PendingPortfolioTopUps` component with back button and section header

### 4. Add "Partner Top-ups" tab content to CFO dashboard
**File: `src/pages/cfo/Dashboard.tsx`**
- Add a `case 'partner-topups'` that renders `PendingPortfolioTopUps` as a dedicated view (it's currently only on the overview page)

### 5. Add "Partner Top-ups" quick nav card to COO dashboard
**File: `src/pages/coo/Dashboard.tsx`**
- Add a new entry to `quickNavItems` array: `{ id: 'partner-topups', label: 'Partner Top-ups', icon: TrendingUp, color: 'bg-green-500/10 text-green-600 border-green-500/20', description: 'Pending top-ups' }`

### 6. Add "Partner Top-ups" tab to Partner Ops dashboard
**File: `src/components/executive/PartnersOpsDashboard.tsx`**
- Add a `topups` tab option alongside existing `portfolios | capital | roi` tabs
- Render `PendingPortfolioTopUps` when the `topups` tab is active

## Files Changed

| File | Action |
|------|--------|
| `supabase/functions/manager-portfolio-topup/index.ts` | Touch to redeploy |
| `src/components/layout/executiveSidebarConfig.ts` | Add sidebar items for COO & CFO |
| `src/pages/coo/Dashboard.tsx` | Add quick nav card + tab case |
| `src/pages/cfo/Dashboard.tsx` | Add dedicated tab case |
| `src/components/executive/PartnersOpsDashboard.tsx` | Add "Top-ups" tab |

