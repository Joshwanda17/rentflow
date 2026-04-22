

## Why LUKODDA JOSEPH's wallet didn't decrease

### What the ledger actually says

The portfolio funding **did** post correctly. At `08:43:10` we have a clean debit:

```text
cash_out · partner_funding · -1,000,000 · ref WIP2604224640
"Welile Operations created portfolio WIP2604224640 for Mutebi Daniel
 — UGX 1,000,000 debited from LUKODDA JOSEPH's proxy-agent wallet"
```

So the **ledger is correct**. The money moved.

### Where the wallet table is wrong

The `wallets` row for LUKODDA right now reads:

| Field | Value |
|---|---|
| `balance` | **1,392,000** ✅ correct (matches ledger net) |
| `withdrawable_balance` | **2,392,000** ❌ stale — should be 1,392,000 |
| `float_balance` | 0 |
| `advance_balance` | 0 |

`balance` updated. The `withdrawable_balance` bucket **did not get decremented** when the partner_funding leg posted.

### Root cause

When I ran the manager top-up at 08:42 (the `system_balance_correction` cash-in of 1M), `recompute_wallet_buckets` correctly set withdrawable to 1,392,000 + 1,000,000 = **2,392,000**.

Then 28 seconds later the `coo-create-portfolio` edge function posted the `partner_funding` cash_out of 1,000,000. That writes to `general_ledger` and updates `wallets.balance` via the ledger trigger — but the **bucket router does not recognise `partner_funding` as a withdrawable-bucket debit**, so it left `withdrawable_balance` untouched. The total `balance` dropped to 1,392,000 (correct), the bucket stayed at 2,392,000 (wrong).

This is the same class of drift we kept hitting earlier today: bucket router's category allowlist doesn't include every category the ledger writes.

### The fix

**Step 1 — Repair LUKODDA's wallet now**
Run `SELECT recompute_wallet_buckets('b4d7c324-1f7e-4e1c-91a8-3f0e10e0b25c')` so the buckets re-derive from ledger. Result: `withdrawable_balance` → 1,392,000, matching `balance`.

**Step 2 — Make `recompute_wallet_buckets` aware of `partner_funding`**
Update the function so `partner_funding` cash_out (when `ledger_scope='wallet'` and the user is the proxy agent / wallet owner) is classified as a **withdrawable-bucket debit**. Today it's silently ignored, which is what produced the drift. Same treatment as `wallet_transfer` and `withdrawal`.

**Step 3 — Add a post-debit recompute to `coo-create-portfolio`**
After the edge function posts the `partner_funding` debit, call `await adminClient.rpc('recompute_wallet_buckets', { p_user_id: <proxy_agent_id> })`. Belt-and-braces — even if a future category is missed, the bucket will reconcile to ledger truth on the spot.

**Step 4 — Realtime UI refresh (already in place)**
`useWalletRealtime` already invalidates wallet queries on `general_ledger` INSERT and `wallets` UPDATE, so once Step 1 + 3 land, the UI will drop instantly without a refresh.

### Audit trail

Insert one `audit_logs` entry: `action_type = 'wallet_bucket_repair_partner_funding'`, `record_id = <wallet id>`, reason: "withdrawable_balance was 2,392,000 vs ledger net 1,392,000 because partner_funding debits were not routed through the withdrawable bucket. Recomputed and patched the router."

### Net effect

| | Before | After |
|---|---|---|
| LUKODDA `balance` | 1,392,000 | 1,392,000 |
| LUKODDA `withdrawable_balance` | 2,392,000 ❌ | 1,392,000 ✅ |
| Future portfolio fundings | drift again | bucket follows ledger |

