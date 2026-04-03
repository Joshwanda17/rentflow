
Problem confirmed in code: the Balance Sheet fix was only partially applied.

What I found:
- `src/hooks/useFinancialStatements.ts` already fetches an all-time platform ledger query.
- But the final Balance Sheet math still does this:
  - split all-time rows into strict `cash_in` and `cash_out`
  - compute `allTimeRevenue = sumBy(allTimePlatformIn, revenueCategories)`
  - compute `allTimeCosts = sumBy(allTimePlatformOut, costCategories)`
- Earlier, the Income Statement was fixed with `sumWithDirectionFallback(...)` because historical entries are not always recorded in the expected direction.
- The Balance Sheet does not use that fallback yet, so historical revenue can still be ignored and `platformCash` can stay `0`.

There is also a second risk:
- the all-time ledger query is a plain `.select(...)` with no batching
- cumulative ledger reads can hit the default row cap and undercount older entries

Plan

1. Fix the Balance Sheet calculation path
- In `src/hooks/useFinancialStatements.ts`, stop using strict direction-only sums for all-time platform cash.
- Recompute all-time platform revenue/costs with the same direction-fallback logic already used for the Income Statement.

2. Reuse one consistent earnings model
- Extract shared category groups for:
  - revenue
  - platform rewards
  - agent commissions
  - transaction expenses
  - operating expenses
- Use the same category mapping for:
  - period Income Statement
  - all-time Balance Sheet platform cash
- This removes the current mismatch where one report uses fallback logic and the other does not.

3. Make the all-time query complete
- Update the all-time platform fetch to handle cumulative history safely instead of relying on a single default-limited read.
- This avoids false zero/low values when the ledger has grown beyond the standard query cap.

4. Keep statement roles correct
- Income Statement stays period-based.
- Cash Flow stays period-based.
- Balance Sheet platform cash stays all-time.
- `opening_balance` exclusion remains in place.

5. Align the rest of the CFO views
- Review `src/components/cfo/DailyCashPositionReport.tsx`
- Review `src/components/cfo/PlatformVsWalletSummary.tsx`
- These still use raw platform inflow minus outflow logic, which can disagree with the Balance Sheet.
- I would either:
  - switch them to the same “earned platform cash” helper, or
  - relabel them clearly as raw ledger net so they do not contradict the Balance Sheet.

Expected result after implementation
- Platform Cash on the Balance Sheet should stop showing `0` when historical earnings exist.
- The figure should remain stable even when the selected tab period is `30 Days`.
- The financial views will use one consistent definition instead of mixed logic.

Technical details
```text
Current issue:
Balance Sheet
= all-time query
+ strict direction filter
- no fallback
= still misses historically misdirected entries

Needed:
Balance Sheet
= all-time query
+ exclude opening_balance
+ direction fallback by category
+ complete fetch (no row-cap truncation)
= true cumulative earned platform cash
```
