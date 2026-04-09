

# Fix: Proxy Partner Balance — Remove Per-Group Clamping, Aggregate at Partner Level

## Problem

Line 206 does `Math.max(0, returns)` per `source_id` group, which silently zeroes out correction entries that landed in different groups than the entries they correct. This inflates balances (e.g., 49M instead of 750K).

## Fix (Frontend — `src/components/agent/ProxyPartnerFunds.tsx`)

### Step 1: Compute partner-level net balance (source of truth)

Replace the current `partnerTotals` calculation (lines 203-207) with a simple sum of ALL entries per `linked_party` — no grouping by `source_id`, no clamping:

```
partnerNet[partnerId] = SUM(credits) - SUM(debits)  // all categories, all source_ids
```

Then subtract completed withdrawals:

```
partnerAvailable[partnerId] = Math.max(0, partnerNet - totalWithdrawn)
```

Single clamp, at the final partner total only.

### Step 2: Portfolio display is cosmetic only

For positive-net portfolio groups, distribute the capped `partnerAvailable` proportionally for display:

```
proportion = max(0, groupNet) / sumOfPositiveGroups
displayAmount = partnerAvailable * proportion
```

Negative or zero groups are simply not displayed — they don't contribute to the total but they also don't get clamped to zero and added.

### Step 3: Remove all per-group `Math.max(0, ...)` calls

- Line 206: `Math.max(0, returns)` → remove
- Line 221: `Math.max(0, totalReturns)` → remove  
- Line 223: `Math.max(0, totalReturns - totalWithdrawn)` → replaced by partner-level available distributed proportionally

### What changes

| Before | After |
|--------|-------|
| Each group clamped to 0 independently | Partner-level sum, single clamp at end |
| Corrections in wrong group = invisible | All corrections always counted |
| 49M + 0 + 0 + 1.5M = 50.5M | 49M - 48M - 1.7M + 1.5M = 750K |

### File changed
- `src/components/agent/ProxyPartnerFunds.tsx` — rewrite `partnerBalances` useMemo (lines 183-245)

No database migration needed.

