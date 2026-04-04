

## Fix Inverted Ledger Direction Values

### Problem
Two edge functions write ledger entries with directions that represent the **tenant's perspective** instead of the **platform's perspective**:

1. **`tenant_access_fee`** is written as `cash_out` (money leaving the tenant) — but for platform reporting, this is revenue and should be `cash_in`
2. **Agent commissions** use `marketing_expense` + `cash_out` on the platform side, which is actually correct for a cost. The real issue is the `tenant_access_fee` direction only.

The reporting layer (`sumWithDirectionFallback`) currently works around this by checking the opposite direction as a fallback — but this is fragile and masks data quality issues.

### Root Cause
The `auto-charge-wallets` and `approve-deposit` edge functions insert `tenant_access_fee` entries with `direction: "cash_out"` because they're written from the tenant's wallet deduction perspective. Since these entries have `ledger_scope: "platform"`, they should use `cash_in` to represent platform revenue.

### Plan

**Step 1: Fix `auto-charge-wallets` edge function**
- Change all `tenant_access_fee` ledger inserts from `direction: "cash_out"` to `direction: "cash_in"`
- There are 2 insert locations in this file (lines ~305 and ~422)

**Step 2: Fix `approve-deposit` edge function**  
- Change the `tenant_access_fee` ledger insert from `direction: "cash_out"` to `direction: "cash_in"`
- 1 insert location (line ~330)

**Step 3: Simplify reporting fallback (optional but recommended)**
- Once future entries are correct, the `sumWithDirectionFallback` function will naturally pick up `cash_in` entries for revenue categories on the preferred pass, making the fallback only needed for historical data

### What stays the same
- Agent commission entries are already correctly structured: `marketing_expense` / `cash_out` on platform scope (a cost) and `agent_commission` / `cash_in` on wallet scope (agent receives money)
- No changes to the `credit_agent_rent_commission` RPC
- No changes to reporting logic (the fallback still handles historical inverted entries gracefully)
- No historical data correction needed — `sumWithDirectionFallback` already handles old entries

### Files to change
- `supabase/functions/auto-charge-wallets/index.ts` — 2 direction fixes
- `supabase/functions/approve-deposit/index.ts` — 1 direction fix

