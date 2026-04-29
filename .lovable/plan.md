## Diagnosis

The screenshot ("Welile Tenant", UGX 1,000,000 rent wallet) belongs to **JOSHUA WANDA** (`cb798acb…`), who submitted a UGX 1,000,000 withdrawal at 13:38 today and got it **manager-approved** at 13:39 (status `manager_approved`). His wallet still shows the full UGX 1,000,000.

Verified in DB:
- `withdrawal_requests` row exists, status = `manager_approved`, `fin_ops_approved_at IS NULL`.
- **Zero ledger entries** linked to this withdrawal — no pending hold, no debit.
- Other recent FinOps-approved withdrawals (Namatovu 20K, Mukhaye 30K, Wakato 15K, etc.) DO have proper `wallet_withdrawal` ledger debits and their wallets reconcile correctly. So the FinOps-approval flow works.

**Root cause**: the withdrawal lifecycle only debits the wallet at the final `fin_ops_approved` step. Between "user requests" → "manager approves" → "FinOps approves" the funds are NOT held, so the wallet card keeps showing the full balance and the user assumes the system is broken.

The `approve-withdrawal` edge function is already designed to find and release pre-existing `withdrawal_pending` ledger holds (lines 156–183 of `supabase/functions/approve-withdrawal/index.ts`) — but **nothing in the codebase ever creates those holds**. The release path is dead code.

## Fix

### 1. Create the missing pending-hold writer
Add a balanced ledger pair the moment a withdrawal request is **created** (and again if a previously rejected one is re-submitted to manager_approved). This shows up immediately on the wallet card via the existing `get_user_available_balance` RPC, which already subtracts pending holds.

Two options for where to write the hold:
- **Preferred**: extend the existing `request-withdrawal` edge function (or wherever `withdrawal_requests` is INSERTed) to call `create_ledger_transaction` with category `withdrawal_pending`, scope `wallet`, direction `cash_out`, balanced by a `withdrawal_pending` `cash_in` on `platform`. This keeps double-entry symmetry and satisfies the strict ledger guard.
- **Backup**: if multiple client paths insert withdrawals, add a Postgres `AFTER INSERT` trigger on `withdrawal_requests` that calls the same RPC.

Implementation will use the **edge function** path (existing pattern, no migration risk to triggers/RLS).

### 2. Make `withdrawal_pending` an allowlisted ledger category
Add `withdrawal_pending` to the locked-flow allowlist in `supabase/functions/_shared/` (and the Postgres allowlist if one exists) so `create_ledger_transaction` doesn't silently reject it in strict mode. Map it as: wallet `cash_out` → `liability` movement; platform `cash_in` → `liability` movement (offsetting). No revenue impact.

### 3. Reconcile the affected open withdrawal NOW
For `72db97da-7f04-4199-8521-1f10476c6f0c` (Joshua Wanda, 1M, manager_approved): backfill a `withdrawal_pending` hold so his wallet card immediately drops by 1,000,000 and the next FinOps approval cleanly releases it (the existing release loop in `approve-withdrawal` already handles this). Do the same for any other `manager_approved`/`pending`/`requested` rows currently missing a hold:

```sql
SELECT wr.id, wr.user_id, wr.amount, wr.status
FROM withdrawal_requests wr
WHERE wr.status IN ('pending','requested','manager_approved')
  AND NOT EXISTS (
    SELECT 1 FROM general_ledger gl
    WHERE gl.source_table='withdrawal_requests'
      AND gl.source_id=wr.id AND gl.category='withdrawal_pending'
  );
```

Backfill hold rows for each via a one-shot script using `create_ledger_transaction`.

### 4. Cancel/reject path
`cancel-proxy-withdrawal` and `reject-withdrawal` must also delete the matching `withdrawal_pending` ledger rows and re-reconcile the wallet — same pattern already used inside `approve-withdrawal`. Audit those two functions and add the release block.

### 5. Wallet-card copy
Add a small "Pending withdrawal: UGX X" line under the available balance when `pending_holds > 0` so users see WHY the balance is lower than what they earned. Source: same `get_user_available_balance` RPC already exposes the breakdown via `useAvailableBalance` hook (it returns `walletCached`, `ledgerNet`; we'll surface a derived `pendingHold = walletCached − available` indicator).

## Files to change

- `supabase/functions/request-withdrawal/index.ts` (or equivalent submit endpoint) — create hold on insert.
- `supabase/functions/reject-withdrawal/index.ts` — release hold on reject.
- `supabase/functions/cancel-proxy-withdrawal/index.ts` — release hold on cancel.
- `supabase/functions/_shared/ledgerCategories.ts` (or the allowlist file) — add `withdrawal_pending`.
- `src/components/wallet/*` (rent wallet card / hero card) — show "Pending withdrawal" sub-line.
- One-shot SQL/edge call to backfill the missing hold for Joshua Wanda's 1M and any other open requests.

## Out of scope

- No wallet bucket math change. The strict-withdrawable rule and the 3-bucket model stay exactly as documented in [Wallet Withdrawable Strict Rule](mem://architecture/wallet-baseline-anchor) and [Wallet 3-Bucket Model](mem://business-model/wallet-three-bucket-model).
- No change to FinOps approval logic — it already releases holds correctly; we're just finally feeding it real holds.
