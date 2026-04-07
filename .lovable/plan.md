

## Fix: Show Only Partner Returns, Not Full Principal

### Problem
When Partner Ops approves a proxy partner, the system credits the partner's **full investment principal** (`investment_amount`) to the agent's wallet as `roi_payout`. This is wrong — the agent should only receive the partner's **earned returns** (`total_roi_earned`) for delivery, not the principal itself.

### Root Cause
In `PendingFunderApprovals.tsx` line 76:
```typescript
const totalInvestment = (portfolios || []).reduce((sum, p) => sum + (p.investment_amount || 0), 0);
```
This queries `investment_amount` instead of `total_roi_earned`.

### Changes

**1. `src/components/executive/PendingFunderApprovals.tsx`**
- Change the portfolio query to select `total_roi_earned` instead of `investment_amount`
- Sum `total_roi_earned` to get the actual returns due to the partner
- Update toast/audit to say "returns" not "investment"

**2. Database: Fix existing incorrect ledger entries**
- Create a migration to reverse the incorrect principal credits that were already inserted
- Query all `roi_payout` entries with `description LIKE '%Proxy partner investment credit%'` 
- For each, look up the actual `total_roi_earned` from the partner's portfolios
- Insert correcting `cash_out` entries for the difference (principal - actual ROI)
- Then insert correct `cash_in` entries for just the ROI amount

**3. `src/components/agent/ProxyPartnerFunds.tsx`** — No code change needed
The display logic already reads from the ledger correctly. Once ledger entries reflect returns instead of principal, the "Available" column will show the correct amounts.

### Summary
One-line fix in the approval flow + a data correction migration to fix the 14 partners that were already credited with principal instead of returns.

