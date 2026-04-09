

# Fix auto-charge-wallets: Revenue Split + Receivable Reduction

## Problem Identified

**Double-counting bug:** When a charge succeeds:
1. The RPC inserts `platform/cash_in/tenant_repayment = totalAmount`
2. `logAndUpdateCharge` inserts into `subscription_charge_logs`
3. The `sync_collection_to_ledger` trigger fires and inserts MORE `platform/cash_in` entries (rent_principal_collected + access_fee_collected + registration_fee_collected = totalAmount)

Result: Platform receives **2x totalAmount** in the ledger. Revenue is inflated. Additionally, no `bridge/cash_out` entry is created, so receivables never reduce.

## Fix (3 Parts)

### Part 1: Modify auto-charge-wallets RPC calls to use proportional split

Replace the flat `platform/cash_in/tenant_repayment` with proportional entries. This requires fetching the rent_request fee breakdown (rent_amount, access_fee, request_fee, total_repayment) for each charge.

**Full payment RPC (lines 291-316):**
```
wallet/cash_out = totalAmount (tenant_repayment)
platform/cash_in = principalShare (rent_principal_collected)
platform/cash_in = accessShare (access_fee_collected)  
platform/cash_in = registrationShare (registration_fee_collected)
```
Where shares are calculated proportionally: `share = chargeAmount * (component / total_repayment)`

Same pattern for partial payments (lines 428-453) and the chargeAgent function.

**Agent fallback (chargeAgent function):** Use `agent_repayment` for float-first deduction per the 72h rule. Only use `agent_commission_used_for_rent` when explicitly deducting from commission balance.

### Part 2: Update sync_collection_to_ledger trigger

Two changes:
1. **Add idempotency guard:** Check if platform-scope ledger entries already exist for this `subscription_charge_logs` record. If so, skip the revenue split (the edge function already handled it).
2. **Add bridge/cash_out receivable reduction:** Insert a `bridge/cash_out/rent_principal_collected` entry for the principal share. This is a direct insert (not via RPC), which is acceptable for the trigger since it's an accounting adjustment, not a cash movement.

```sql
-- Idempotency guard (add at top of trigger)
IF EXISTS (
  SELECT 1 FROM general_ledger 
  WHERE source_table = 'subscription_charge_logs' 
  AND source_id = NEW.id::TEXT
) THEN
  RETURN NEW;
END IF;

-- Add after existing revenue entries:
IF v_rent_share > 0 THEN
  INSERT INTO general_ledger (...) VALUES (
    ..., v_rent_share, 'cash_out', 'rent_principal_collected',
    ..., 'bridge', v_group_id
  );
END IF;
```

### Part 3: Fetch rent_request data in auto-charge-wallets

At the start of each charge loop iteration, if `charge.rent_request_id` exists, fetch the fee breakdown to calculate proportional shares. If no rent_request (edge case), fall back to the flat `tenant_repayment` category.

```typescript
let principalShare = chargeAmount;
let accessShare = 0;
let registrationShare = 0;

if (charge.rent_request_id) {
  const { data: rr } = await supabase.from('rent_requests')
    .select('rent_amount, access_fee, request_fee, total_repayment')
    .eq('id', charge.rent_request_id).single();
  
  if (rr && rr.total_repayment > 0) {
    principalShare = Math.round(chargeAmount * (rr.rent_amount / rr.total_repayment));
    accessShare = Math.round(chargeAmount * (rr.access_fee / rr.total_repayment));
    registrationShare = chargeAmount - principalShare - accessShare;
  }
}
```

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/auto-charge-wallets/index.ts` | Replace flat tenant_repayment with proportional split in all RPC calls (full, partial, agent). Fetch rent_request breakdown. Fix agent fallback to use agent_repayment. |
| 1 database migration | Update `sync_collection_to_ledger` trigger: add idempotency guard + bridge/cash_out receivable reduction |

## Verification

After deployment:
- No duplicate platform/cash_in entries per collection
- Bridge receivables reduce proportionally with each payment
- Revenue categories (access_fee_collected, registration_fee_collected) reflect actual proportional amounts
- Partial payments split proportionally (no full fee on partial)

