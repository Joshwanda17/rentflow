

# Fix Plan: Agent Withdrawal & Product Purchase — Broken RPC Calls

## Discovery

Auditing `agent-withdrawal` and `product-purchase` revealed **three critical bugs** that make both functions silently fail at the ledger layer. These are the "remaining anti-patterns" from the user's list.

## Bug Details

### Bug 1 — Wrong RPC parameter name: `p_entries` instead of `entries`

Both functions pass `p_entries` to the RPC. The actual parameter name is `entries`. Postgres silently ignores unknown named parameters, so the RPC receives `NULL` for `entries` and fails.

**Affected files:** `agent-withdrawal/index.ts`, `product-purchase/index.ts`

### Bug 2 — Phantom parameter: `p_transaction_group_id`

Both functions pass `p_transaction_group_id`. This parameter does not exist on the RPC — the RPC generates its own `group_id` internally. This is harmless (ignored) but misleading.

### Bug 3 — Wrong field name: `scope` instead of `ledger_scope`

Both functions use `scope: 'wallet'` / `scope: 'platform'` in entry objects. The RPC reads `entry->>'ledger_scope'`. Result: all entries get `NULL` ledger_scope, bypassing the wallet sync trigger entirely.

### Bug 4 — Unbalanced double-entry in `agent-withdrawal`

Both legs are `cash_out`:
- Leg 1: user wallet `cash_out` (correct)
- Leg 2: platform `cash_out` (wrong — should be `cash_in`)

The RPC's balance check (`total_in != total_out`) will reject this, so agent withdrawals always fail.

## Fixes

### File 1: `supabase/functions/agent-withdrawal/index.ts`

1. Change `p_entries:` → `entries:`
2. Remove `p_transaction_group_id` parameter
3. Change `scope:` → `ledger_scope:` on both entries
4. Change Leg 2 direction from `cash_out` → `cash_in` (platform receives the withdrawn funds)
5. Add `currency: 'UGX'` and `transaction_date` fields to match the standard entry format

### File 2: `supabase/functions/product-purchase/index.ts`

1. Change `p_entries:` → `entries:`
2. Remove `p_transaction_group_id` parameter
3. Change `scope:` → `ledger_scope:` on all entry objects (6 entries across the file)

### RPC Safety Guard (migration)

Add a runtime type check at the top of `create_ledger_transaction`:

```sql
IF jsonb_typeof(entries) <> 'array' THEN
  RAISE EXCEPTION 'entries must be a JSON array, got: %', jsonb_typeof(entries);
END IF;
```

This makes the entire class of serialization/parameter bugs impossible in the future.

### Deployment

Redeploy `agent-withdrawal` and `product-purchase` edge functions.

## Reconciliation

Only **1 user** currently shows wallet-ledger drift (UGX 6,000). This will be noted but no correction is needed until the full reconciliation pass.

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/agent-withdrawal/index.ts` | Fix parameter name, field names, balance direction |
| `supabase/functions/product-purchase/index.ts` | Fix parameter name, field names |
| Database migration | Add `jsonb_typeof` guard to RPC |

