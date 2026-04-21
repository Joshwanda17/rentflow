

## Reconcile Akandwanaho Wycliffe's wallet buckets

### What's actually in the data

| Bucket | Current | Should be | Notes |
|---|---:|---:|---|
| Operational Float (`agent_landlord_float.balance`) | **3,342,400** | 3,342,400 | ✅ Already correct — includes the two Airtel deposits (105k + 37.4k = 142,400) swept yesterday |
| Wallet `balance` (legacy total) | 93,000 | 93,000 | ✅ Sum is right |
| Wallet `withdrawable_balance` (Commission bucket) | **50,000** | **93,000** | ❌ Off by 43,000 — commissions earned 13–14 Apr never landed in the bucket |
| Wallet `float_balance` | 0 | 0 | ✅ |
| Wallet `advance_balance` | 0 | 0 | ✅ |

The 93,000 is not "funder money" — every entry that produced it is `agent_commission_earned` (landlord verification + rent-funded bonuses) earned by him as an agent. The visual confusion is that in the 3-bucket model only 50,000 sits in `withdrawable_balance`; the other 43,000 is stuck in the legacy `balance` field without being routed into the commission bucket.

### The fix (one migration, two corrections)

**1. Reconcile the commission bucket**
Bring `withdrawable_balance` up to match the true commission earnings on the wallet:
```sql
UPDATE wallets
SET withdrawable_balance = 93000,
    updated_at = now()
WHERE user_id = '04ef6aad-ade8-4dbc-ae3f-09669a836952';
```
This re-tags the 43,000 gap as Commission (where it belongs for an agent), so the **Agent Wallet card** on his dashboard will read:

```text
FLOAT          UGX 0          (locked – operations)   ← personal float bucket, unrelated to ops float
COMMISSION     UGX 93,000     (withdrawable)
TOTAL BALANCE  UGX 93,000
```

**2. Confirm the operational float reflects deposits**
The `agent_landlord_float.balance = 3,342,400` already includes both Airtel deposits via the backfill done yesterday. No action needed — the **AGENT WALLET → Operations Float** view (sourced from `useAgentLandlordFloat`) will show the deposits tallied in.

**3. Audit log**
Insert one `audit_logs` row (`action_type: wallet_bucket_reconciliation`, table `wallets`, 10+ char reason) so the correction is traceable.

### What you'll see after the fix

On the agent's Welile Agent dashboard (the screen in your screenshot):
- **FLOAT** card stays **UGX 0** (this is the personal `float_balance` bucket, which agents never use — separate from Operations Float)
- **COMMISSION** card flips from `UGX 50,000` → **`UGX 93,000`** (withdrawable)
- **Total Balance** stays **UGX 93,000** but is now fully on the commission side
- The **Operations Float** widget (separate component, reads `agent_landlord_float`) continues to show **UGX 3,342,400**, which already includes the 142,400 in deposits

### Why no money is moving out of "Funder"
There is no funder wallet here — Akandwanaho only has one row in `wallets` and his role is agent. The 93,000 was always agent commission; the bug was only that the bucket split row didn't promote it into `withdrawable_balance`. No ledger entries are being created (the underlying ledger is correct); only the cached bucket columns on `wallets` are being reconciled, which is the standard remediation for the 17 wallet-drift cases the integrity check already flags.

### Files / objects touched

- **New migration**: `supabase/migrations/<ts>_reconcile_wycliffe_buckets.sql` — `UPDATE wallets` + `INSERT audit_logs`
- No edge function or frontend changes needed; existing `AgentWalletCard` / `useAgentBalances` / `useAgentLandlordFloat` will reflect the new numbers on next refetch.

