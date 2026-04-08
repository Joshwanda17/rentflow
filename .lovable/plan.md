

# Fix: Proxy Partners Showing Wrong ROI (Dividing by 12)

## Problem

The `roi_percentage` stored in portfolios is already a **monthly** rate (e.g., 15% = 750,000/month on 5M). But two files incorrectly divide by 12, treating it as an annual rate — resulting in partners seeing ~1/12th of their actual returns.

## Affected Files & Lines

| File | Line | Current (Wrong) | Fix |
|------|------|-----------------|-----|
| `src/components/agent/ProxyPartnerFunds.tsx` | 173 | `(investmentAmount * roiPercentage) / 100 / 12` | `(investmentAmount * roiPercentage) / 100` |
| `src/components/executive/PendingFunderApprovals.tsx` | 102 | `investment_amount * roi_percentage / 100 / 12` | `investment_amount * roi_percentage / 100` |

These are the two places where `/12` incorrectly deflates the monthly ROI calculation.

## What Changes

### 1. ProxyPartnerFunds.tsx (Agent's Proxy Partners tab)
- Line 173: Remove `/ 12` from the monthly ROI calculation
- This fixes the "Returns Due", "Available", and "Withdraw" amounts shown to agents

### 2. PendingFunderApprovals.tsx (Partner Ops approval flow)
- Line 102: Remove `/ 12` from the accrued ROI calculation
- This fixes the amount that gets credited to the agent's wallet when Partner Ops approves a proxy assignment

### 3. Add safety guard
- Both locations: add a null/sanity check on `roiPercentage` (reject values over 100% as invalid)

## Verification

After fix, a partner with UGX 5,000,000 at 15% should show:
- Monthly ROI: **UGX 750,000** (not 62,500)
- After 3 months: **UGX 2,250,000** returns due (not 187,500)

## Note on COOPartnersPage.tsx

The COO payout lines (2587, 2643, 2825, 2467, 2766) already use the correct formula without `/12`. No changes needed there.

