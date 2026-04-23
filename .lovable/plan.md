

## Plan: Fix Silent Failures on CFO Wallet Deduction & Direct Debit

### What's broken

The CFO clicks **Deduct from Wallet** (or **Direct Debit**) → button does nothing visible → toast doesn't fire → silent failure. This is happening because the edge function is returning a 400 with an error message the UI is not surfacing.

### Concrete evidence (from edge logs)

```
wallet-deduction → Ledger RPC error: code=23514
"new row for relation 'wallets' violates check constraint 'wallets_buckets_nonneg'"
Failing row: withdrawable_balance=-60,000, float_balance=100,000
```

Wallet `b6c0bc4e-...` has:
- `balance = 100,000`
- `withdrawable_balance = 0` ← empty
- `float_balance = 100,000` ← full

CFO is trying to deduct UGX 60,000. The router sends `wallet_deduction (cash_out)` to the **withdrawable** bucket (verified: `wallet_route_for_category` returns `(withdrawable, -1)`), so `apply_wallet_movement` does `0 - 60,000 = -60,000`, the `wallets_buckets_nonneg` CHECK rejects it, the whole transaction rolls back, and the user sees nothing because the UI's mutation handler isn't extracting the structured error.

### Root cause (two layers)

1. **Bucket-blind balance check.** `wallet-deduction/index.ts` line 108 only checks `wallet.balance >= amount` (the *total*). It never checks the specific bucket the deduction will draw from. When float holds the money but the route targets withdrawable, the deduction fails at the DB layer.

2. **Silent UI failure.** The deduction/CFO-debit dialogs are not running the error response through `extractEdgeFunctionError` (or equivalent), so the structured `{ error: "..." }` body returned with status 400 is dropped on the floor — no toast, no log visible to the operator.

A third issue (cfo-direct-credit) is the same shape: when CFO debits an agent whose money sits in `float`, the same bucket violation occurs.

### Fix (3 parts)

**1. Make `wallet-deduction` bucket-aware (server-side, no UI change needed)**

In `supabase/functions/wallet-deduction/index.ts`:
- Fetch all three buckets (`withdrawable_balance`, `float_balance`, `advance_balance`) instead of just `balance`.
- If `withdrawable_balance >= amount` → keep the current single ledger entry (routes through withdrawable as today).
- If `withdrawable_balance < amount` but `withdrawable + float >= amount` → split the deduction into **two ledger entries**: one `wallet_deduction` for the withdrawable portion and one `float_retraction` (already in allowlist, routes to `float`) for the remainder. Both balance against the platform leg.
- If total still insufficient → return a clear `{ error: "Insufficient ... withdrawable: X, float: Y, requested: Z" }` with status 400.

**2. Make `cfo-direct-credit` bucket-aware on debit**

Same logic in the `op === "debit"` branch: if `walletCat` routes to withdrawable but the bucket is empty, either (a) auto-split between withdrawable and float (`float_retraction` for the float portion), or (b) when `walletCat = 'wallet_transfer'` / `system_balance_correction` — categories that already route to float for agents — the existing path is fine. Add a pre-check that picks the right category based on actual bucket holdings.

**3. Surface backend errors in the UI**

Touch the two callsites:
- `src/components/cfo/WalletDeductionDialog.tsx` (or whichever calls `wallet-deduction`)
- `src/components/cfo/CFODirectCreditDialog.tsx` (or equivalent for `cfo-direct-credit`)

Wrap the `supabase.functions.invoke` response with `extractEdgeFunctionError(...)` (already exists in `src/lib/extractEdgeFunctionError.ts`) and pipe the result into `toast.error(...)`. This guarantees every backend rejection becomes a visible toast — no more silent buttons, even for future edge cases.

### Verification

1. Re-run the failed deduction: UGX 60,000 from a wallet with `withdrawable=0, float=100,000` → succeeds with split entries (withdrawable -0, float -60,000) and balance becomes 40,000 in float.
2. Try a deduction larger than total balance → toast shows: *"Insufficient balance. Withdrawable: UGX 0, Float: UGX 100,000, Requested: UGX 200,000"*.
3. CFO direct debit on an agent with float-only balance → succeeds via float route; toast confirms.
4. Existing successful flows (deduction from a wallet with sufficient withdrawable) → unchanged.

### Files to change

- `supabase/functions/wallet-deduction/index.ts` — bucket-aware balance check + auto-split ledger entries.
- `supabase/functions/cfo-direct-credit/index.ts` — same bucket-aware logic in debit branch.
- `src/components/cfo/WalletDeductionDialog.tsx` (and the CFO direct-debit dialog component, exact filename to confirm in implementation) — use `extractEdgeFunctionError` to show real error messages in toasts.

### Risks & mitigations

- **Risk**: Auto-splitting a deduction across two buckets could confuse downstream reporting. **Mitigation**: Use the existing `float_retraction` category for the float portion (already an allowlisted, audited flow); each leg is independently traceable in `general_ledger`.
- **Risk**: Touching `cfo-direct-credit` could affect the credit branch. **Mitigation**: The change is scoped strictly to the `op === "debit"` branch; credits remain untouched.
- **Risk**: UI changes might mask new errors. **Mitigation**: We keep `console.error` alongside the toast so error remain in browser logs.

