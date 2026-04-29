## What's actually failing

The toast `Ledger error: new row for relation "wallets" violates check constraint "wallets_balance_check"` is raised by Postgres because `wallets.balance` (or a bucket) was driven below 0 by `apply_wallet_movement`. The constraint is `CHECK (balance >= 0)` and bucket subtractions are unclamped.

Tracing the CFO Wallet Deduction flow:

1. UI shows "Withdrawable" using the **strict** RPC `get_user_available_balance` — that value is capped by the ledger floor (`min(cache, ledger_net) − holds`). It can be **lower** than the cached `wallets.withdrawable_balance`.
2. The CFO types up to that strict number (e.g. UGX 145,097,964) and submits.
3. `wallet-deduction` edge function ignores the strict RPC. It reads the **cached** `withdrawable_balance` + `float_balance` and, if cached withdrawable can't cover the request, **spills the remainder into the user's float bucket** as `agent_float_settlement`.
4. Float is company liability money (per the 3-bucket rule, "never withdrawable"). Spilling into it is illegal AND if the cached float is smaller than the spill, the bucket UPDATE goes negative → `wallets_balance_check` fires and the whole transaction aborts with the message you see.

So two bugs compound: (a) the edge function is allowed to draw float, which violates the wallet model; (b) it sizes the deduction from a cache the UI doesn't trust, so what looks deductible to the CFO can blow past what the ledger/buckets actually support.

## Fix

### 1. Edge function `wallet-deduction` — strict-withdrawable only

- Call `get_user_available_balance(target_user_id)` (the same RPC the UI uses) and use **that** as the cap. Reject the request if `amount > strict_available` with a clear "Maximum deductible: UGX X" message that matches what the panel shows.
- **Remove the float-spill branch entirely.** A CFO wallet deduction must only debit withdrawable. If the user genuinely owes more than their withdrawable, that is a separate workflow (advance/recovery), not this tool.
- Keep the existing role check, treasury guard, validation, and audit logging intact.
- Keep one ledger-balanced pair: `wallet_deduction` cash_out (wallet scope, recipient_type='user') + `wallet_deduction` cash_in (platform scope). Pass `recipient_type: 'user'` so Wallet Routing v2 routes to withdrawable as required.

### 2. Edge function — defensive bucket pre-check

Even after capping by the strict RPC, re-read `wallets.withdrawable_balance` inside the same request right before issuing the RPC and assert `cache_withdrawable >= amount`. If a race lowered it, return a friendly "Balance changed, please retry" 409 instead of letting the constraint fire.

### 3. UI `WalletDeductionPanel.tsx` — surface the new error cleanly

- When the edge function returns the new "Maximum deductible" or "Balance changed" errors, show them as the toast description (no code change to the message format — the function already returns `{ error }`).
- Remove the now-unreachable "Float only — company liability" copy paths that implied float could be touched here, leaving only the withdrawable display.
- Auto-refresh the `deduction-available-balance` query on submit failure so the CFO immediately sees the corrected ceiling.

### 4. Diagnostics

- Add a one-line `console.error` in the edge function logging `{ user_id, requested, strict_available, cache_withdrawable, cache_float }` whenever a deduction is rejected, so we can audit any future drift between cache and strict.
- Insert a row into `wallet_overdraw_events` (already exists per memory) for any rejected attempt where `cache_withdrawable < strict_available`, so the CFO Reconcile tab surfaces these silently-broken wallets.

## Out of scope / not changed

- No DB migration. The `balance >= 0` constraint stays — it's the safety net that caught this.
- `apply_wallet_movement` stays the sole writer; we are not touching it.
- Other deduction paths (advance recovery, withdrawal approval) are unaffected.
- No change to the ledger schema or to the strict RPC.

## Files to edit

- `supabase/functions/wallet-deduction/index.ts` — strict cap, remove float-spill, defensive recheck, diagnostic logs.
- `src/components/financial-ops/WalletDeductionPanel.tsx` — clean error surfacing + invalidate balance on failure; remove dead "float-only" hint.

## Expected outcome

- The 145M UGX deduction will either succeed cleanly (debiting withdrawable only) or be rejected up front with the exact deductible cap. The "wallets_balance_check" constraint will no longer fire from this tool.
- Float buckets are protected; the CFO Wallet Deduction tool can no longer touch company liability money.
