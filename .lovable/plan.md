

## Make CFO-credited money always withdrawable

**Rule (per your directive):** When the CFO credits a user wallet, that money moves from *Money We Have* (platform cash) to *Money We Owe* (user wallet liability) and the recipient — any user, any role — must be able to withdraw it without restriction.

### Current state (verified)

- `cfo-direct-credit` writes a balanced ledger pair: platform `cash_out` + wallet `cash_in`. ✅
- The bucket router (`wallet_route_for_category`) already routes `system_balance_correction`, `cfo_direct_credit`, `manager_credit`, `general_admin_expense`, etc. to the **withdrawable** bucket. ✅
- BUT: some historical wallets show drift — total `balance` is high while `withdrawable_balance` is low, so withdrawals fail with `INSUFFICIENT_WITHDRAWABLE` even though the money is "there". This is what blocked the 7M proxy payout (26.7M total vs. real withdrawable < 7M).
- And the `approve-withdrawal` function currently only allows the *withdrawable* bucket to fund payouts — correct in principle, but it has no awareness that **CFO-deposited money is, by policy, always withdrawable**.

### What will change

**1. Lock CFO credits to the withdrawable bucket (defensive)**
In `supabase/functions/cfo-direct-credit/index.ts`, after the ledger write, explicitly recompute the recipient's wallet from the ledger so the `withdrawable_balance` column reflects the new credit immediately. Today we rely on the ledger trigger; we'll add an idempotent post-write call to `reconcile_wallet_from_ledger(target_user_id)` so the bucket can never drift on a CFO action.

**2. Heal historical drift for all wallets**
Run `reconcile_wallet_from_ledger` across every wallet once. This recomputes `withdrawable_balance`, `float_balance`, `advance_balance`, and total `balance` strictly from `general_ledger`, so any past CFO credit that didn't land in the right bucket is corrected. No money is created or destroyed — only the bucket split is fixed.

**3. Withdrawal acceptance: trust the ledger**
In `supabase/functions/approve-withdrawal/index.ts`, before computing the gate, also call `reconcile_wallet_from_ledger(funding_user_id)` so the withdrawable figure used to decide approval is the ledger-true value, not a stale column. The existing 3-bucket gate stays intact — withdrawals still draw from `withdrawable` first then `float` for proxy payouts — but we eliminate the false-negative caused by drift.

**4. Operator-visible confirmation**
The CFO direct-credit response will include `new_withdrawable_balance` so the CFO sees, in the same response, that the funds are immediately withdrawable.

### Why this matches the directive

- CFO credit = platform `cash_out` (Money We Have ↓) + wallet `cash_in` to **withdrawable** (Money We Owe ↑, immediately payable).
- "Any user can withdraw money sent by CFO" — guaranteed because every CFO credit forces a reconciliation that lands the funds in the withdrawable bucket.
- No new categories, no schema changes — uses existing `reconcile_wallet_from_ledger` RPC and existing routing rules.

### Files touched

- `supabase/functions/cfo-direct-credit/index.ts` — call `reconcile_wallet_from_ledger` after credit; return `new_withdrawable_balance`.
- `supabase/functions/approve-withdrawal/index.ts` — call `reconcile_wallet_from_ledger` for the funding user before bucket gate.
- One-off SQL via insert tool: loop `reconcile_wallet_from_ledger(user_id)` across all wallets to heal historical drift.

### Out of scope

- Changing the 3-bucket model itself (float and advance buckets keep their meaning).
- Allowing withdrawals to silently dip into `float_balance` for non-proxy users (that would break the agent float guarantee).

