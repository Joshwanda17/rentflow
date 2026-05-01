## Goal

The Financial Ops "Total Money in All Wallets" card currently shows **only the cached total** (`SUM(wallets.balance)` via `get_wallet_totals`). That number is known to drift above the strict ledger position. Fin Ops needs to see both numbers side-by-side so the cache-sweep workflow has an obvious target.

## What changes for the user

The hero card keeps the big cached number as the headline (it's the operator's working figure) but gains a second line directly under the wallet/with-balance row:

```text
USh 123,112,408                              [cached headline — unchanged]
👥 6,086 wallets · 233 with balance >
─────────────────────────────────────────────
Strict ledger total: USh 121,800,000         [new, dimmer]
Cache drift: +USh 1,312,408 across 47 wallets  [new, amber if >0, green tick if 0]
```

When drift is non-zero the "Cache drift" line is a button that opens the existing CFO Cache Sweep panel (or scrolls to it on the Fin Ops Reconcile tab) so the operator can act on it in one click.

Nothing about the cached headline, the "Tap to deduct" CTA, the Live/Paused toggle, or the two queue tiles changes.

## Technical plan

### 1. New SQL RPC: `get_wallet_totals_strict()`

Mirror of `get_wallet_totals` but sums the **strict ledger figure** per wallet instead of `wallets.balance`. Returns one JSON row:

- `strict_total` — `SUM(get_user_available_balance(user_id) + COALESCE(float bucket, 0))` across all wallets except the system holding account `06b14430-…`. Rationale: the cached headline includes both withdrawable and float buckets (it's `wallets.balance`, the all-bucket sum), so the strict comparison must include both for an apples-to-apples variance.
  - Withdrawable side: `get_user_available_balance(user_id)` (already strict, ledger-derived, anchored, holds-aware).
  - Float side: derived from `general_ledger` net of float-bucket categories per the existing `v_user_wallet_strict` view definition — re-use that view rather than re-deriving.
- `drifted_wallets` — count of wallets where `wallets.balance > strict_per_wallet` by more than 100 UGX (matches the existing reconciliation tolerance).
- `total_drift` — `SUM(GREATEST(wallets.balance − strict_per_wallet, 0))` so it's always the "cache excess" figure (drift below strict isn't a sweep target — that's a separate underflow problem already monitored elsewhere).

Properties: `STABLE`, `SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE TO authenticated, service_role` (matches `get_wallet_totals`). Implemented as a single set-based query against `v_user_wallet_strict` joined to `wallets` so it stays cheap at 6k wallet scale.

### 2. Frontend: extend `WalletOverviewCard`

- Add a second `useQuery` keyed `['finops-wallet-overview-strict']` calling `get_wallet_totals_strict`. Same `staleTime` / `refetchInterval` rules as the cached query so they refresh together.
- Render a divider + two new lines under the existing `wallets / with balance` row:
  - "Strict ledger total: {formatUGX(strict_total)}" — muted-foreground, smaller.
  - "Cache drift: +{formatUGX(total_drift)} across {drifted_wallets} wallets" — amber when drift > 0, emerald check + "Reconciled" when drift ≤ 100 UGX.
- When `drifted_wallets > 0`, wrap the drift line in a button that calls a new optional `onOpenCacheSweep?: () => void` prop. `e.stopPropagation()` so it doesn't trigger the parent "Tap to deduct" handler.
- Loading/error: if the strict query fails or is loading, show a thin "Strict total: calculating…" placeholder — never block the cached headline.

### 3. Wire the new prop on the Fin Ops page

In `src/pages/admin/FinancialOps.tsx` (the `/admin/financial-ops` route), pass `onOpenCacheSweep` that switches to the Reconcile tab and scrolls to `CacheSweepPanel`. Re-use whatever tab-switch mechanism is already present for the existing `onOpenDeductions` wiring.

### 4. Memory update

Append a one-liner to `mem/architecture/user-facing-wallet-view.md` under "Database surface": new `get_wallet_totals_strict()` RPC is the operator-facing companion to `get_wallet_totals` — same shape, strict ledger-derived, used by Fin Ops Wallet Overview to surface cache drift.

## Out of scope

- No change to the cached headline (operators explicitly want to keep working from it).
- No change to `get_wallet_totals` itself (other operator dashboards depend on its current shape).
- No change to user-facing wallet views (already strict-only per the existing memory).
- No new sweep logic — only surfaces drift; the existing `wallet-cache-sweep` edge function + `CacheSweepPanel` remain the sole audited path to act on it.
