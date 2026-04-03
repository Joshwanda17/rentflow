
The screenshot is not right.

What I found:
- The “Platform Safety Net” card is driven by `src/components/manager/BufferAccountPanel.tsx`, which calls the backend RPC `get_buffer_metrics()`.
- That RPC is defined in `supabase/migrations/20260228101719_b3748c9d-6489-43c6-9e86-40fad617d388.sql`.
- The RPC still sums ledger rows using old direction values:
  - `credit`
  - `debit`
- But the actual `general_ledger.direction` only allows:
  - `cash_in`
  - `cash_out`
  as confirmed in the ledger table migration and generated types.

Why the UI is wrong:
- Because the RPC checks for `credit/debit`, both `totalCashIn` and `totalCashOut` evaluate to `0`.
- Then the panel computes:
  - `netBuffer = 0 - 0 = 0`
  - `coverageRatio = 1.00x`
  - `capitalUtilization = 0%`
  - `liquidityRatio = 0%`
- So the screen is showing a fake “zeroed” solvency state caused by broken aggregation, not real financial data.

There are also two follow-up correctness issues:
1. `get_buffer_metrics()` aggregates from all ledger rows without filtering to the intended reporting scope, so even after fixing directions it may still mix platform, wallet, and bridge flows.
2. It does not exclude synthetic `opening_balance` rows, which you already identified as contaminating financial statements.

What to change:
1. Fix `get_buffer_metrics()` to use `cash_in` / `cash_out`
2. Restrict the aggregation to the correct ledger scope for solvency/buffer reporting
3. Exclude `opening_balance` rows
4. Review `get_buffer_trend_data()` too, because it has the same outdated `credit/debit` bug and will also produce incorrect charts
5. Keep the rent metrics, but ensure they align with the intended solvency definition

Expected result after the fix:
- Cash In / Cash Out should stop showing `USh 0`
- Net Buffer should reflect real ledger-backed totals
- Coverage Ratio, Capital Utilization, and Liquidity Buffer should move from fake placeholder values to actual solvency metrics
- The alert banner should only appear when thresholds are truly breached

Technical details:
```text
Current bug:
get_buffer_metrics():
SUM(CASE WHEN direction = 'credit' THEN amount ...)
SUM(CASE WHEN direction = 'debit' THEN amount ...)

Actual schema:
general_ledger.direction IN ('cash_in', 'cash_out')

Result:
all buffer cash totals collapse to zero
```

Implementation scope:
- `supabase/migrations/...` update for `get_buffer_metrics()`
- `supabase/migrations/...` update for `get_buffer_trend_data()`
- No major UI redesign needed; the main issue is backend metric correctness
