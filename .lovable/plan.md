

## Fix: Negative Commission from `tenant_default_charge` Misclassification

### Problem
`get_agent_split_balances` includes `tenant_default_charge` in the commission **spend** categories. This means when a tenant defaults, the penalty is deducted from the agent's commission balance instead of their operations float. For Lolem, this caused a -8,101 UGX commission balance.

### Root Cause
In the `get_agent_split_balances` RPC, `tenant_default_charge` is listed alongside `agent_commission_withdrawal` and `agent_commission_used_for_rent` as a commission deduction. Per your core rule — "Commission = agent's money (always withdrawable), Float = company money" — tenant defaults should reduce float, not commission.

### Fix (single migration)

**Update `get_agent_split_balances` RPC**: Remove `tenant_default_charge` from the commission spend categories. The deduction will then naturally reduce the total wallet balance, which in turn reduces the float (total - commission), leaving commission untouched.

```sql
-- Remove 'tenant_default_charge' from commission spend line
-- Before: ('agent_commission_withdrawal','agent_commission_used_for_rent','tenant_default_charge')
-- After:  ('agent_commission_withdrawal','agent_commission_used_for_rent')
```

### Impact
- Lolem's commission: -8,101 → **+5,500** (53,000 earned - 47,500 reclassified)
- Lolem's float: 8,101 → **-5,500** (clamped to 0 by `GREATEST(0, ...)`)
- No data changes needed — just the calculation logic

