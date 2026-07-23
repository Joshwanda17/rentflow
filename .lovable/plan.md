
# Single Source of Truth for Wallet Balances

## The problem (concrete example)

On the CFO Merchant Float panel we currently render two numbers side-by-side for the same wallet:

- **Wallet cache** (`wallets.float_balance`) = UGX **1,484,091**
- **Ledger sum / "After usage"** (sum of `general_ledger` rows, `wallet_bucket='float'`) = UGX **1,509,091**

That UGX 25,000 gap is a **cache drift**: the ledger has one more (or one fewer) row than `apply_wallet_movement` applied to the cache. Both numbers are truthful about their source — but only one is authoritative. Today the app shows both, and different screens pick different ones. That is the root of every "the balances don't match" complaint.

## The rule we will enforce

> **The ledger is the only source of truth. `wallets.*_balance` is a display cache and is never allowed to disagree with the ledger. When they disagree, the cache is wrong — repair it, don't display it.**

## What the plan delivers

```text
   general_ledger (immutable rows)
             │
             ▼
   v_user_wallet_strict  ← the ONE authoritative view (per bucket)
             │
             ▼
   useAuthoritativeWalletBalance(userId)   ← the ONE React hook
             │
             ▼
   Every card / report / withdrawal gate / CFO panel
```

Every UI, RPC, and edge function that needs a balance goes through that hook or that view. No component computes its own.

---

## Step 1 — One authoritative view in the database

`v_user_wallet_strict` already exists and is described in memory as *"THE pivot/comparator between wallets cache and general_ledger"*. We extend/confirm it exposes, per `user_id`:

- `withdrawable_ledger`, `float_ledger`, `advance_ledger` (summed from `general_ledger` with correct `direction` signing and the user-facing filter)
- `withdrawable_cache`, `float_cache`, `advance_cache` (from `wallets`)
- `withdrawable_drift`, `float_drift`, `advance_drift` (cache − ledger)
- `strict_withdrawable` = `max(0, min(withdrawable_cache, withdrawable_ledger) − pending_holds)` (already the rule)

Add a companion RPC `get_authoritative_wallet(p_user_id uuid)` returning the same struct so edge functions and the client can call one function instead of joining views.

## Step 2 — One React hook for the whole app

Create `src/hooks/useAuthoritativeWalletBalance.ts`:

- Calls `get_authoritative_wallet` via React Query.
- Returns `{ withdrawable, float, advance, drift, isStale }` where each bucket is the **ledger** figure (never the cache).
- Subscribes to a realtime channel on `general_ledger` for the user so any new ledger row triggers an immediate refetch.
- Exposes a `refetch()` that all mutation flows (deposit, withdrawal, payout, commission, settlement) call after success.

Delete/deprecate the ad-hoc balance reads scattered across:
- `useAgentBalances`, `useAgentCompanyExposure`, hero/full-screen wallet cards, `WithdrawFlow`, `MerchantFloatRequestsPanel`, `CashoutAgentManager`, `WalletDeductionPanel` remnants, reports, PDFs.

They all become thin consumers of the hook.

## Step 3 — Fix the CFO Merchant Float panel first (visible today)

In `src/components/cfo/MerchantFloatRequestsPanel.tsx`:

- Remove the "Wallet cache: UGX …" line and the dual display entirely.
- Show a single **"Float balance: UGX X"** value — always the ledger figure from the hook.
- If `Math.abs(drift) >= 1`, show an amber inline chip *"Cache repair needed — auto-scheduled"* (see step 4). No competing numbers.
- The batch-timeline "After usage" of the final batch is guaranteed to equal that displayed balance because both come from the same summation.

## Step 4 — Kill drift at the source

Cache drift is a bug in the write path, not the read path. Two hardenings:

1. **Trigger-level reconciliation**: extend `apply_wallet_movement` (the sole writer per memory) so it computes `expected_cache = old_cache + signed_delta` and also `SELECT` the ledger sum for that bucket. If they diverge by ≥ 1 UGX after the movement, insert a row into `wallet_overdraw_events` / `phantom_wallet_drift` and **snap the cache to the ledger** in the same transaction. The cache becomes provably ledger-equal at commit time.
2. **Continuous monitor**: the existing `detect_phantom_wallet_drift` cron already scans every 15 min. Add a companion `repair_phantom_wallet_drift` that, for any row where drift ≠ 0, calls a session-flagged `reseed_wallet_from_ledger(user_id, bucket)` — snapping the cache down/up to the ledger figure and posting the correction to `wallet_backup_2026_04_17` for audit.

After steps 1 + 4, `cache = ledger` is a database-enforced invariant, not a hope.

## Step 5 — Lock down every remaining reader

Grep sweep + fixes for anything that reads `wallets.*_balance` directly:

- Replace direct table reads with `get_authoritative_wallet` or `v_user_wallet_strict`.
- Reports (`daily-wallet-inflows-report`, `daily-landlord-ops-report`, `generate_merchant_cashout_daily_report`, CFO exports, PDF wallet statements) all switch to the view.
- Withdrawal validation (`approve-withdrawal`, `enforce_withdrawal_ledger_match`) already gates on strict — verify no legacy code paths still read the raw cache.
- Client-side balance sums (any `SUM(...)` in TSX/hooks) are removed; the balance number is never recomputed on the client.

## Step 6 — Verification

Add a CFO **"Balance Integrity"** tab that queries `v_user_wallet_strict` and lists any wallet where any bucket's `|drift| >= 1`. Target: empty at all times. If it's non-empty, the repair cron will clear it within 15 min and log the correction.

Manual verification checklist run once per bucket:

- Deposit → cache and ledger both move by exactly the deposit amount; hook returns the new figure everywhere in ≤ 1 s.
- Withdrawal → same.
- Merchant Float top-up + settlement → panel shows one number that equals the last batch's "After usage".
- Rejection penalty / commission credit → same.

## Success criteria

- Every screen (Wallet Card, Merchant Dashboard, CFO Dashboard, reports, withdrawal validation, cash-out, settlement, mobile, web) reads one number from one hook backed by one view.
- `wallet.cache = ledger.sum` is enforced at write time and self-heals at read time.
- No component performs its own balance arithmetic.
- The Merchant Float panel that today shows 1,484,091 vs 1,509,091 will show a single figure equal to the ledger sum, and the drift will be repaired to zero within one cron tick.

---

## Technical details (for reference)

- New/confirmed DB objects: `v_user_wallet_strict` (extend), `get_authoritative_wallet(uuid)` RPC, `reseed_wallet_from_ledger(uuid, text)` RPC, `apply_wallet_movement` trigger extension, `repair_phantom_wallet_drift` cron.
- New client module: `src/hooks/useAuthoritativeWalletBalance.ts` + a `WalletBalance` shared component for consistent formatting.
- Files touched (non-exhaustive): `MerchantFloatRequestsPanel.tsx`, `WithdrawFlow.tsx`, `FullScreenWalletSheet.tsx`, `CashoutAgentManager.tsx`, `useAgentBalances.ts`, `useAgentCompanyExposure.ts`, PDF/report generators, edge functions listed above.
- Follows existing memory rules: Wallet Sole Writer, Wallet Write Lockdown, Withdrawable Strict Rule, User-facing ledger filter, Anchored Cache Drift.

