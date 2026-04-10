

# Investigation: 49M Displayed for Partner on Agent Proxy Tab

## What I Found

The 49M is real data for partner **NFITUMUKIZA BOSCO**, managed by agent **LUKODDA JOSEPH**. Here's the ledger history:

```text
Date        | Direction | Amount  | Description
2026-04-07  | cash_in   | 49.0M   | "Proxy partner investment credit on approval (backfill)" [source_id: 118b6d67]
2026-04-07  | cash_out  | 49.0M   | "Correction: reverse incorrect principal credit" [source_id: NULL]
2026-04-07  | cash_in   | 951K    | "Proxy partner returns credit (corrected)" [source_id: NULL]
2026-04-08  | cash_out  | 1.7M    | "Clean slate correction: zero out legacy proxy ROI" [source_id: 13b8dd75]
2026-04-08  | cash_in   | 750K    | ROI payout [source_id: a4ec5735]
2026-04-09  | cash_in   | 750K    | ROI payout [source_id: a4ec5735]
```

**Partner-level net = ~750K** (correct). The 49M reversal worked financially.

## The Display Bug

The component groups entries by `(linked_party, source_id)`. The 49M credit has `source_id = 118b6d67` but the 49M reversal has `source_id = NULL`. They land in **different groups**.

The "Returns Due" column (`totalReturns`) shows the per-group net, not the partner-level net. So the group with `source_id: 118b6d67` shows **49M Returns Due** even though Available is correctly ~728K.

This is a **misleading display**, not a financial error. The money is correct, but the label is wrong.

## Fix

Change `totalReturns` to show the proportional share of the partner's actual total returns (positive groups only), not the raw group net. This ensures the "Returns Due" column reflects reality.

### Code Change (ProxyPartnerFunds.tsx)

In the `partnerBalances` builder (line 229-250), replace `totalReturns: groupNets[key]` with a proportional share of the actual partner-level total returns:

```typescript
// Before
totalReturns: groupNets[key],

// After  
totalReturns: Math.round(Math.max(0, partnerNet[group.partnerId]) * proportion),
```

This ensures "Returns Due" reflects the true partner-level balance (after corrections), distributed proportionally — matching the "Available" logic exactly.

## Technical Details

- File: `src/components/agent/ProxyPartnerFunds.tsx`, line 246
- The `partnerNet` variable already has the correct partner-level sum
- The `proportion` variable is already computed correctly
- Only one line changes
- No database migration needed

