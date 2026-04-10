

# Fix Plan: Agent Workflow — All 6 Flaws

## Current State After Previous Fixes
- **Flaws 1 & 2** (JSON.stringify in `agent-deposit` and `tenant-pay-rent`): **Already fixed.**
- **One extra instance found**: `supabase/functions/auto-charge-wallets/index.ts` line 907 still uses `JSON.stringify(entries)` — must fix too.
- **Flaws 3–6**: All still present and confirmed in the codebase.

---

## Changes

### 1. Fix `JSON.stringify` in `auto-charge-wallets` edge function
Remove `JSON.stringify()` wrapper at line 907. Pass raw array to RPC. Redeploy the function.

### 2. Fix tenant list to include `agent_id`-linked tenants (Flaw 3)
In `AgentTenantsSheet.tsx`, after fetching tenants via `referrer_id`, also query `rent_requests` for `agent_id = user.id` to get additional tenant IDs. Fetch those profiles and merge/deduplicate into the tenant list.

### 3. Fix status filter in `AgentTopUpTenantDialog` (Flaw 4)
Change line 97 from:
```ts
.in('status', ['approved', 'disbursed', 'active'])
```
to:
```ts
.in('status', ['approved', 'funded', 'disbursed', 'repaying'])
```

### 4. Fix duplicate dialog title (Flaw 6)
Change lines 167-168 to a single title: `"Pay Rent for Tenant"`.

### 5. Add "Renew Rent" button for completed tenants (Flaw 5)
In the tenant detail view within `AgentTenantsSheet.tsx`, when a tenant's latest rent request has status `completed`, show a "Renew Rent" button that opens the `AgentRentRequestDialog` pre-filled with the tenant's name, phone, and previous rent details.

### 6. Redeploy edge function
Deploy `auto-charge-wallets` after fix.

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/auto-charge-wallets/index.ts` | Remove `JSON.stringify` (1 site) |
| `src/components/agent/AgentTenantsSheet.tsx` | Merge `agent_id` tenants; add Renew button |
| `src/components/agent/AgentTopUpTenantDialog.tsx` | Fix status filter; fix duplicate title |

No database migrations required.

