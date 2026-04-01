

# Fix: Add Agent Commission to Tenant Self-Pay Rent Flow

## Problem
When a tenant pays rent via `tenant-pay-rent`, no agent commission is credited. The `credit_agent_rent_commission` RPC is never called, so the assigned agent misses their UGX 10,000 flat commission (8k/2k sub-agent split if applicable).

## How It Should Work
The `credit_agent_rent_commission` RPC already resolves the correct agent from `COALESCE(assigned_agent_id, agent_id)` on the rent request — so it will always pay the **assigned agent**, not whoever triggers the payment.

## Change

### `supabase/functions/tenant-pay-rent/index.ts`

After the `record_rent_request_repayment` RPC call succeeds (line 142), add:

```typescript
// 3. Credit the assigned agent's commission (RPC resolves agent from rent request)
const { error: commissionErr } = await supabaseAdmin.rpc(
  "credit_agent_rent_commission",
  {
    p_rent_request_id: rentRequest.id,
    p_repayment_amount: payAmount,
    p_source_table: "tenant_pay_rent",
    p_source_id: rentRequest.id,
  }
);
if (commissionErr) {
  console.error("Commission error (non-blocking):", commissionErr);
  // Non-blocking — payment already succeeded, commission failure is logged but doesn't fail the tenant
}
```

This is a single line addition. The RPC handles:
- Looking up the assigned agent from the rent request
- Sub-agent / parent-agent 8k/2k split
- Idempotency guard (won't double-credit)
- Ledger entry with `transaction_group_id` → wallet trigger fires automatically

No other files need changes.

