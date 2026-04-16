

## Fix: "Allocate from Float" Button Not Working

### Root Cause

The `agent_allocate_tenant_payment` RPC has **stale commission logic** that doesn't match the recently updated `get_agent_split_balances` RPC. Two specific mismatches:

1. **Still includes `tenant_default_charge`** in commission spend categories (removed from `get_agent_split_balances` in the latest migration)
2. **Missing `partner_commission`** from commission earn categories (added to `get_agent_split_balances`)

This means the UI shows Float = X (correct), but the RPC internally calculates Float = Y (wrong). When the agent clicks "Allocate," the RPC returns `{success: false, error: 'Insufficient float balance'}` — but the toast may not be visible or the response handling may silently fail.

Additionally, the RPC returns `float_after` and `outstanding_after` but the dialog success view expects `float_before`, `outstanding_remaining`, and `commission` — causing the success screen to show broken data if allocation does succeed.

### Fix (single migration + minor UI tweak)

**1. Update `agent_allocate_tenant_payment` RPC** to sync commission logic with `get_agent_split_balances`:

- **Remove** `tenant_default_charge` from commission spend categories
- **Add** `partner_commission` to commission earn categories
- **Add** `float_before`, `outstanding_remaining`, and `commission` to the return JSONB so the dialog success screen renders correctly

```sql
-- Commission earn categories (synced):
'agent_commission_earned', 'agent_commission', 'agent_bonus',
'referral_bonus', 'proxy_investment_commission', 'agent_advance_credit',
'partner_commission'

-- Commission spend categories (synced):
'agent_commission_withdrawal', 'agent_commission_used_for_rent'
-- tenant_default_charge REMOVED
```

**2. Update `AgentTenantCollectDialog.tsx`** — ensure the success view safely handles both old and new response field names (`outstanding_after` vs `outstanding_remaining`).

### Files Changed
- **Migration SQL**: `CREATE OR REPLACE FUNCTION agent_allocate_tenant_payment` with synced categories and enriched return
- **`src/components/agent/AgentTenantCollectDialog.tsx`**: Safe field mapping for success view

### Impact
- The float calculation inside the RPC will match what the UI shows
- Allocations that were silently failing will now succeed
- Success screen will display correctly with float before/after and commission earned

