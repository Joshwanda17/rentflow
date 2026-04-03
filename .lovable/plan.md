# Fix: Agent Commission Logic — Overloaded Functions and Wrong Display

## What's Wrong

The screenshot shows **UGX 8,000 commission on a UGX 4,000 rent payment** (200% commission). This is clearly incorrect — 10% of 4,000 should be 400.

### Root Cause: Two conflicting versions of the same function

There are **two overloaded `credit_agent_rent_commission` functions** in the database with different signatures:


| Version                      | Params                                                         | Commission Rate | Return Field       |
| ---------------------------- | -------------------------------------------------------------- | --------------- | ------------------ |
| **Old** (migration 20260330) | `(rent_request_id, repayment_amount, source_table, source_id)` | **5%**          | `commission`       |
| **New** (migration 20260402) | `(rent_request_id, repayment_amount, tenant_id)`               | **10%**         | `total_commission` |


Different callers hit different overloads depending on which parameters they pass:

- `agent-deposit` passes `p_source_table` + `p_source_id` → hits the **old 5%** version
- `tenant-pay-rent` passes 3 positional args → ambiguous which overload runs
- `auto-charge-wallets` passes `p_source_table` + `p_source_id` → hits the **old 5%** version

This creates:

1. **Inconsistent commission rates** (5% vs 10%) depending on which path triggers the payment
2. **Broken idempotency** — the two versions use different idempotency checks (`general_ledger` vs `commission_accrual_ledger`), so the same repayment could be double-credited if called via both overloads
3. **Missing platform double-entry** — the old version credits the agent wallet but never records the corresponding platform `marketing_expense`, leaving the books unbalanced
4. **Wrong UI display** — `agent-deposit` reads `commissionResult?.commission` which exists on the old overload's response, but the value displayed to the agent doesn't match the actual percentage applied

## Fix Plan

Use 10% of the money paid. That should be the commission in the agents wallet 

### 1. Drop the old overload, keep only the new 10% version

Create a migration that:

- `DROP FUNCTION` the old 4-param signature explicitly
- Ensure the surviving 3-param version (`p_rent_request_id, p_repayment_amount, p_tenant_id`) is the only one

### 2. Update all edge function callers to use the correct signature

Files to update:

- `**supabase/functions/agent-deposit/index.ts**` — change from `(p_source_table, p_source_id)` to `(p_tenant_id)`, and read `total_commission` instead of `commission` from the result
- `**supabase/functions/auto-charge-wallets/index.ts**` — same parameter fix
- `**supabase/functions/manual-collect-rent/index.ts**` — same parameter fix
- `**supabase/functions/retry-no-smartphone-charges/index.ts**` — same parameter fix
- `**supabase/functions/tenant-pay-rent/index.ts**` — already passes the right shape but verify
- `**supabase/functions/approve-deposit/index.ts**` — same parameter fix

### 3. Fix the commission display in the UI

- `**src/components/agent/AgentTopUpTenantDialog.tsx**` line 132: read `data?.details?.agent_commission` which comes from `actualCommission || commission`
- In `agent-deposit`, fix line 456 to read `commissionResult?.total_commission` instead of `commissionResult?.commission`
- This ensures the displayed value matches what was actually credited

### 4. Remove the local commission calculation from agent-deposit

Currently the edge function computes `commission = repaymentAmount * 0.10` locally (line 330) and uses it as a fallback. This should be removed — the RPC is the single source of truth for commission amounts. The local calculation also incorrectly deducts commission from the landlord payment (`landlordPayment = repaymentAmount - commission`), which means the landlord gets 10% less than they should.

## Technical Summary

```text
Before (broken):
  agent-deposit → calls old 4-param RPC (5% rate, no platform entry)
  auto-charge  → calls old 4-param RPC (5% rate)
  tenant-pay   → calls new 3-param RPC (10% rate)
  → Different rates, different audit trails, double-credit risk

After (fixed):
  All callers → call single 3-param RPC (10% rate, platform double-entry, proper idempotency)
  → One rate, one audit trail, consistent commission display
```