

# Fix: Proxy Agent Sees Full Accrued Returns Instead of Only Credited ROI

## The Problem

The screenshot shows NFITUMUKIZA BOSCO with **UGX 11,586,348** available for withdrawal. This person should only receive UGX 750,000 per month (the approved payout), but the Proxy Partners tab is recalculating ALL returns from portfolio creation date instead of reading only what has been approved and credited to the agent's wallet.

**How it happens today (wrong):**
1. Partner has 5M @ 15% portfolio created ~15 months ago
2. ProxyPartnerFunds.tsx calculates: `5M × 15% × 15 months = 11,250,000`
3. Agent sees UGX 11.5M as withdrawable — the entire lifetime of returns
4. Agent can withdraw that full amount in one go

**What should happen (correct):**
1. COO initiates monthly ROI payout (750K) → goes to pending_wallet_operations
2. CFO approves → edge function credits agent wallet via general_ledger (category: `roi_payout`, linked_party: partner_id)
3. ProxyPartnerFunds should only show the sum of these **actual approved credits** minus completed withdrawals

## Root Cause (Two Issues)

### Issue 1: ProxyPartnerFunds.tsx — Recalculates instead of reading ledger
Lines 148-203 calculate returns from portfolio age using `investmentAmount × roiPercentage / 100 × monthsElapsed`. This shows the full theoretical lifetime return, not what was actually approved and credited.

### Issue 2: PendingFunderApprovals.tsx — Credits all accrued returns on proxy approval
Lines 120-156 calculate ALL accrued returns since portfolio creation and credit the agent's wallet in one lump sum via `credit_proxy_approval` RPC. This means the moment a proxy is approved, months/years of theoretical returns get dumped into the agent's wallet — bypassing the monthly COO→CFO approval pipeline entirely.

## Fix Plan

### 1. ProxyPartnerFunds.tsx — Read actual ledger credits instead of recalculating

Replace the portfolio-based ROI calculation with a query to `general_ledger` for actual `roi_payout` credits where `user_id = agent_id` and `linked_party = partner_id`. This ensures the agent only sees money that was actually approved and deposited.

**Data source change:**
- Remove: `investor_portfolios` query and monthly ROI math
- Add: `general_ledger` query filtering `category = 'roi_payout'` and `user_id = agent.id` with `linked_party` matching partner IDs
- **Returns Due** = sum of all `roi_payout` credits for that partner
- **Delivered** = sum of completed `proxy_partner_withdrawal` withdrawals (already correct)
- **Available** = Returns Due − Delivered

### 2. PendingFunderApprovals.tsx — Remove lump-sum credit on approval

Remove the `credit_proxy_approval` RPC call (lines 146-156) from the approval flow. Proxy approval should only activate the assignment — it should NOT credit any money. Monthly payouts go through the normal COO→CFO pipeline, which is the correct path.

- Remove the portfolio query and ROI calculation (lines 120-143)
- Remove the `credit_proxy_approval` call (lines 147-156)
- Keep the assignment status update and audit log
- Update the success toast to remove the "returns credited" message

### 3. Display adjustment

Keep the existing "Invested" and "Returns Due" display on the approval cards for informational purposes, but label it clearly as "Accrued (not yet paid)" so operators understand this is just context, not what gets credited.

## What This Fixes

- Agent can only withdraw what was actually approved by CFO
- No lump-sum credit dump on proxy approval
- Monthly payout discipline is enforced end-to-end
- The 750K monthly payout for NFITUMUKIZA BOSCO would show correctly after the next approved cycle

## Files Changed

| File | Change |
|------|--------|
| `src/components/agent/ProxyPartnerFunds.tsx` | Replace portfolio ROI calculation with ledger-based query |
| `src/components/executive/PendingFunderApprovals.tsx` | Remove lump-sum credit on proxy approval |

