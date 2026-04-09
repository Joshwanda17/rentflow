

# Per-Portfolio Payout Tracking in Proxy Agent & Approval Views

## Problem
When a partner like NAMBAFU SHEILLAH has multiple portfolios (e.g., "ALICE NAMONO" / WIP2509086610 and WIP2604081274), both ROI payouts land in the agent's proxy view as **one combined balance** because the code groups by `linked_party` (partner user ID). The agent cannot distinguish which portfolio's ROI they're withdrawing for, and the approval queue doesn't show portfolio references either.

**Root cause**: `ProxyPartnerFunds.tsx` aggregates ledger entries by partner ID only. The data already contains `source_id` (portfolio ID) on every ledger entry — it's purely a display/grouping problem.

## What changes

### 1. `src/components/agent/ProxyPartnerFunds.tsx` — Per-portfolio breakdown

**Current**: Groups all ROI entries by `linked_party` → one card per partner with combined balance.

**New**: 
- Fetch the agent's assigned partners' portfolios (`investor_portfolios` where `investor_id` in approved partner IDs) to get portfolio codes and account names
- Also fetch `source_id` from the ledger query (already available — `general_ledger.source_id` maps to portfolio ID)
- Group ledger entries by `(linked_party, source_id)` instead of just `linked_party`
- Render one card per **portfolio** instead of per partner:
  ```
  NAMBAFU SHEILLAH
  Portfolio: ALICE NAMONO (WIP2509086610)
  Returns Due: USh 60,000 | Delivered: 0 | Available: USh 60,000
  [Withdraw USh 60,000]

  NAMBAFU SHEILLAH  
  Portfolio: WIP2604081274
  Returns Due: USh 60,000 | Delivered: 0 | Available: USh 60,000
  [Withdraw USh 60,000]
  ```
- Include `portfolio_id` in the withdrawal request metadata and prefill reason so FinOps knows which portfolio the agent is withdrawing for
- Update `PartnerBalance` interface to include `portfolioId`, `portfolioCode`, `accountName`

### 2. `src/components/financial-ops/ApprovalQueue.tsx` — Show portfolio ref in wallet ops queue

- In `getItemDisplayLabel`, for `roi_payout` category items, extract `source_id` from `rawData` and show: `"ROI Payout · Portfolio: XXXXXXXX"` instead of just the raw description
- Also extract `metadata.partner_name` if available and show it alongside the user name when different

### 3. `src/components/executive/PartnerFinancialActivity.tsx` — Show portfolio ref in activity feed

- When building activity rows from `walletOps`, extract `source_id` and include the first 8 chars as a portfolio reference in the description column for `roi_payout` entries
- Format: `"ROI payout · Portfolio: 33e070bc"`

## Technical details

**Ledger query change in ProxyPartnerFunds**: Add `source_id` to the select (it's already on `general_ledger`):
```sql
SELECT user_id, linked_party, amount, direction, category, source_id
FROM general_ledger
WHERE user_id = :agentId AND category IN ('roi_payout', 'balance_correction')
```

**Portfolio lookup**: One additional query to get portfolio codes:
```sql
SELECT id, portfolio_code, account_name, investor_id
FROM investor_portfolios
WHERE investor_id IN (:approvedPartnerIds)
```

**Withdrawal tagging**: When creating proxy withdrawal, include `portfolio_id` and `portfolio_code` in metadata so the FinOps approval queue can trace exactly which portfolio the withdrawal is for.

## Files changed
1. `src/components/agent/ProxyPartnerFunds.tsx` — group by portfolio, show per-portfolio cards, tag withdrawals with portfolio ID
2. `src/components/financial-ops/ApprovalQueue.tsx` — show portfolio ref for ROI payout items
3. `src/components/executive/PartnerFinancialActivity.tsx` — show portfolio ref in activity rows

