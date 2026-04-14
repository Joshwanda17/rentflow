

## Investigation Results: Why Agents Aren't Getting Commission

### Root Cause Found

The `approve-deposit` edge function only calls `credit_agent_rent_commission` when the deposit request has an `agent_id` set:

```typescript
// Line 248 — commission is SKIPPED when agent_id is null
if (depositRequest.agent_id && rentRequestId) {
  await supabaseAdmin.rpc("credit_agent_rent_commission", { ... });
}
```

**All recent deposits (since April 9) have `agent_id: null`** — they are self-deposits made by agents or tenants directly, not through an intermediary agent. So even though rent repayments are correctly applied (13+ repayments totaling hundreds of thousands of UGX), the commission call is skipped entirely.

The commission RPC itself already handles agent lookup internally from `rent_requests.agent_id` and `rent_requests.assigned_agent_id` — it does NOT need the deposit's `agent_id` at all. The guard condition is over-restrictive.

### Evidence
- Last `agent_commission` ledger entry: **April 9**
- Repayments since April 9: **15+ records** (UGX 23K–780K each)
- All via deposits where `deposit_requests.agent_id = null`
- The `credit_agent_rent_commission` RPC correctly returns `no_agents` if no agent is linked — so it's safe to call unconditionally

### Fix

**File: `supabase/functions/approve-deposit/index.ts`**

Remove the `depositRequest.agent_id` guard from all three commission call sites (lines 248, 337, 421). Change:

```typescript
if (depositRequest.agent_id && rentRequestId) {
```
to:
```typescript
if (rentRequestId) {
```

This applies to three locations in the file:
1. **Line 248** — After initial rent repayment
2. **Line 337** — After clearing accumulated debt
3. **Line 421** — After pre-paying future days

The RPC safely handles the case where no agent exists (returns `no_agents` status with zero commission).

### Backfill Missing Commissions

After the fix, create a one-time backfill script to credit the missed commissions for the 15+ repayments since April 9. This would call `credit_agent_rent_commission` for each repayment that has no matching `commission_accrual_ledger` entry.

### Files

| File | Action |
|------|--------|
| `supabase/functions/approve-deposit/index.ts` | **Edit** — remove `agent_id` guard from 3 commission calls |
| Backfill script (one-time) | **Run** — credit missed commissions for April 9–14 repayments |

