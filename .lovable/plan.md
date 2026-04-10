

# Fix: Add 10% Agent Commission to Manual Rent Collection

## Current State

The function at `supabase/functions/manual-collect-rent/index.ts` already calls `credit_agent_rent_commission` RPC (line 181) after collection. However, per the request, the commission should be embedded as direct ledger entries with explicit `agent_commission_earned` and platform `commission_expense` categories — matching the locked production categories — instead of delegating to a separate RPC whose internal behavior may not align.

## What Changes

**File:** `supabase/functions/manual-collect-rent/index.ts`

Replace the `credit_agent_rent_commission` RPC call (lines 180-185) with a direct `create_ledger_transaction` call containing 2 commission legs:

```
const commission = Math.round(totalCollected * 0.10);
if (commission > 0 && rr.agent_id) {
  const commissionTxDate = new Date().toISOString();
  const commissionIdempotencyKey = `manual-collect-commission-${rr.id}-${commissionTxDate}`;

  await supabase.rpc('create_ledger_transaction', {
    entries: [
      // Leg 1: Credit agent wallet
      { user_id: rr.agent_id, ledger_scope: 'wallet', direction: 'cash_in',
        amount: commission, category: 'agent_commission_earned',
        source_table: 'rent_requests', source_id: rr.id,
        description: `10% commission on manual rent collection for ${tenantName}`,
        currency: 'UGX', transaction_date: commissionTxDate },
      // Leg 2: Platform expense
      { user_id: rr.agent_id, ledger_scope: 'platform', direction: 'cash_out',
        amount: commission, category: 'agent_commission_earned',
        source_table: 'rent_requests', source_id: rr.id,
        description: `Commission expense: manual collection for ${tenantName}`,
        currency: 'UGX', transaction_date: commissionTxDate },
    ],
    idempotency_key: commissionIdempotencyKey,
  });
}
```

Also update the audit log metadata and response JSON to include `commission_paid: commission`.

## Why Not Keep `credit_agent_rent_commission`

The direct approach ensures: (1) the exact approved categories (`agent_commission_earned`) are used, (2) idempotency is deterministic per rent request + timestamp, (3) the commission amount and logic are visible and auditable in this function rather than hidden in an RPC.

## No database changes needed

