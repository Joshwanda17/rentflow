Root cause found: the previous “uplift” was still trying to update `wallets.withdrawable_balance`, but `wallets` is now a read-only ledger-derived view, not a physical cache table. The RPC fails with `cannot update view "wallets"`, and the approve function treats that failure as non-fatal, so the old `cachedSpendable = 0` value still vetoes approval even when `ledger-true = UGX 5,000`.

Plan to fix it:

1. Remove the stale cache veto in Financial Ops approval
   - In `supabase/functions/approve-withdrawal/index.ts`, recompute the spendable amount after the ledger check.
   - For normal withdrawals, use the ledger-backed pre-hold figure for approval, not `Math.min(cachedSpendable, ledgerAvailable)`.
   - This directly matches your requirement: if the ledger says the user's withdrawable money is UGX 5,000 and the pending withdrawal is UGX 5,000, Financial Ops can approve the full amount.

2. Patch the final ledger posting guard
   - `create_ledger_transaction` still has its own cached-wallet cap inside the database function.
   - For normal withdrawals, the edge function already performs the strict ledger check, so the ledger posting call should use `skip_balance_check: true` for withdrawals after that check passes.
   - This prevents the final ledger insert from failing for the same stale-cache/view reason.

3. Retire/fix the broken uplift RPC
   - Replace `lift_withdrawable_to_ledger` with a no-op diagnostic RPC, or stop calling it from approval.
   - Since `wallets` is now a view derived from `v_user_wallet_strict`, there is no physical `withdrawable_balance` cache to lift anymore.
   - Approval should trust the strict ledger calculation directly.

4. Keep safety rules intact
   - Still block payouts when ledger withdrawable is truly insufficient.
   - Still exclude float and advance buckets for normal user withdrawals.
   - Still subtract other pending withdrawals, while adding back the currently-approved request so a full-balance withdrawal can complete.
   - Still use fresh database reads, not React Query cache.

5. Verify against the exact failing case
   - Re-check the pending withdrawal shown in your screenshot/request: response currently says `Available UGX 0, requested UGX 5,000, ledger-true UGX 5,000`.
   - After the patch, that case should pass approval because the ledger proves the full requested amount is available.
   - Also verify that a user with true ledger balance UGX 0 still remains blocked.