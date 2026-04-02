

# Wire Up Event Bonuses to Commission Accrual Ledger

## Current State

**What's working:**
- `credit_agent_rent_commission` RPC — fully implemented with correct 10% split logic (2% source, 8% manager, 2% recruiter override). Called from 7 edge functions on every repayment.
- `credit_agent_event_bonus` RPC — exists in database with correct amounts (5K/5K/20K/10K) and idempotency guards.
- `commission_accrual_ledger` table — has all required columns (agent_id, tenant_id, event_type, commission_role, percentage, amount, timestamps).

**What's broken:**
1. **`credit_agent_event_bonus` is NEVER called** — the RPC exists but zero edge functions invoke it. Event bonuses are only written to the old `agent_earnings` table, bypassing the commission accrual ledger entirely.
2. **Dual-write inconsistency** — repayment commissions go to the ledger, but event bonuses only go to `agent_earnings`. This means the `CommissionAccrualLedger` UI is missing all bonus entries.
3. **Sub-agent registration bonus not credited** — when `activate-supporter` creates a sub-agent relationship, no bonus is credited to the parent agent at all.
4. **Stale "5% commission" references** — several email templates say "5% commission" but the system uses 10%.

## Changes

### 1. `supabase/functions/approve-rent-request/index.ts`
After crediting the approval bonus to `agent_earnings` (line ~249), also call:
```ts
await adminClient.rpc('credit_agent_event_bonus', {
  p_agent_id: rentRequest.agent_id,
  p_tenant_id: rentRequest.tenant_id,
  p_event_type: 'rent_request_posted',
  p_source_id: rent_request_id
});
```

### 2. `supabase/functions/approve-listing-bonus/index.ts`
After the `agent_earnings` insert (~line 143), also call:
```ts
await serviceClient.rpc('credit_agent_event_bonus', {
  p_agent_id: approval.agent_id,
  p_tenant_id: null,
  p_event_type: 'house_listed',
  p_source_id: approval.id
});
```

### 3. `supabase/functions/activate-supporter/index.ts`
After the sub-agent relationship insert (~line 246), credit the parent agent:
```ts
if (isSubAgent && parentAgentId) {
  await adminClient.rpc('credit_agent_event_bonus', {
    p_agent_id: parentAgentId,
    p_tenant_id: null,
    p_event_type: 'subagent_registration',
    p_source_id: authData.user.id
  });
}
```

### 4. `supabase/functions/transfer-tenant/index.ts` (if tenant replacement logic exists)
Call `credit_agent_event_bonus` with `p_event_type: 'tenant_replacement'` when a tenant is replaced.

### 5. Fix "5% commission" email text
In `fund-agent-landlord-float/index.ts` and `disburse-rent-to-landlord/index.ts`, change "5% commission" → "10% commission" in the email body strings.

## Files Modified
- `supabase/functions/approve-rent-request/index.ts` — add `credit_agent_event_bonus` call
- `supabase/functions/approve-listing-bonus/index.ts` — add `credit_agent_event_bonus` call
- `supabase/functions/activate-supporter/index.ts` — credit sub-agent registration bonus
- `supabase/functions/fund-agent-landlord-float/index.ts` — fix "5%" → "10%"
- `supabase/functions/disburse-rent-to-landlord/index.ts` — fix "5%" → "10%"

## No database changes needed
The `credit_agent_event_bonus` RPC and `commission_accrual_ledger` table already exist with correct schema and idempotency guards.

