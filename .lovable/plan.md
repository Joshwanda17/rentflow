

## Fix: Proxy Partner Tab — Show Only Approved Partners with Actual Returns

### Problem
Two issues in the agent's Proxy Partners tab:
1. **Old/non-proxy data showing**: Partners like WINNIE & RICHARD and MUSEMA KIZITO appear because they have `roi_payout` ledger entries with `linked_party` set — but they were never approved through Partner Ops.
2. **Principal shown instead of returns**: The "Received" column sums ALL `roi_payout` ledger entries (including old managed payouts, backfill principal credits, and corrections), producing inflated/incorrect amounts.

### Root Cause
Line 155 in `ProxyPartnerFunds.tsx`:
```typescript
const visiblePartnerIds = [...new Set([...approvedPartnerIds, ...Object.keys(grouped)])];
```
This includes ANY partner with a `roi_payout` ledger entry linked to the agent — not just those approved via Partner Ops.

Additionally, the "Received" amount reads from messy ledger data (principal credits, corrections, old managed payouts) instead of calculating actual earned returns.

### Solution
Rewrite `ProxyPartnerFunds.tsx` to:

**1. Only show approved proxy partners**
- Remove `Object.keys(grouped)` from the visible list — use only `approvedPartnerIds` from `proxy_agent_assignments` where `approval_status = 'approved'`

**2. Calculate returns from portfolios, not ledger**
- For each approved partner, query their `investor_portfolios` (active)
- Calculate accrued ROI using the same time-based formula as `PendingFunderApprovals.tsx`:
  ```
  monthlyROI = investment_amount × roi_percentage / 100 / 12
  monthsElapsed = (min(now, maturity) - created_at) / 30 days
  returns = monthlyROI × monthsElapsed
  ```
- This gives the actual returns due, not principal

**3. Track withdrawals from withdrawal_requests**
- Query `withdrawal_requests` with `linked_party` matching the partner and completed status
- Available = calculated returns - completed withdrawals

### Files to Modify
| File | Change |
|------|--------|
| `src/components/agent/ProxyPartnerFunds.tsx` | Rewrite data loading: only approved partners, calculate ROI from portfolios, track withdrawals separately |

### Result
- Only 16 approved proxy partners will show (no WINNIE & RICHARD, no MUSEMA KIZITO)
- "Received" shows actual calculated returns (e.g., NFITUMUKIZA BOSCO: ~951K, not 49M)
- "Available" = returns - delivered withdrawals
- No dependency on polluted ledger entries

