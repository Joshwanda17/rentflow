## Goal

Two outcomes, one shipment:

1. **End users never see a cached `wallets.*` figure again.** Every wallet number a tenant, agent, supporter or landlord sees is derived strictly from `get_user_wallet_view` / `get_user_available_balance` (the ledger).
2. **CFO + Financial Ops can still see and deduct cached phantom balances** that exceed the strict ledger position — so they can clean up drift without touching live customer money.

The hybrid model already approved (cache stays for operators, ledger truth for users) is the foundation. This plan finishes the user-facing migration and adds the operator tool.

---

## Part A — Kill cached reads on every user-facing surface

These files still call `useWallet()` / `wallet?.balance` / `.from('wallets').select('balance')` and render the result to end users. All must switch to `useAvailableBalance` or `useAgentBalances` (already strict-ledger).

### 1. `src/hooks/useWallet.ts` — make it strict by construction

Replace the `wallets` table SELECT with a `get_user_wallet_view` RPC call. Drop the `computeLedgerAvailable` overlay (now redundant) and drop the auto-create-wallet INSERT (wallet provisioning is server-side via triggers; client should never write). Keep the same `wallet.balance` field name on the returned object so call-sites don't break — the value is just now `withdrawable + float + advance` from the strict view, never the cache. Keep realtime + the 60s anti-drift sweep.

This single change instantly fixes ~25 downstream components without per-file edits.

### 2. Per-component cache reads to remove

Replace direct `.from('wallets').select(...)` with the RPC in:

- `src/components/payments/WithdrawFlow.tsx`
- `src/components/agent/AgentPartnerDashboardSheet.tsx`
- `src/components/agent/AgentInvestForPartnerDialog.tsx`
- `src/components/agent/AgentWithdrawalDialog.tsx`
- `src/components/agent/AgentAngelPoolInvestDialog.tsx`
- `src/components/agent/AgentManagedUsersSheet.tsx` (line 242 still renders `wallet.balance`)
- `src/components/agent/ProxyPartnerDepositDialog.tsx`
- `src/components/agent/TenantProfileView.tsx`
- `src/components/tenant/RepaymentHistoryDrawer.tsx`
- `src/components/wallet/FullScreenWalletSheet.tsx` (line 490 fallback `wallet?.balance`)
- `src/components/wallet/CollapsibleWalletCard.tsx`
- `src/components/supporter/InvestmentBreakdownSheet.tsx`, `FundRentDialog.tsx`, `FunderCapitalOpportunities.tsx`, `InvestmentAccountsDrawer.tsx`

For each: pull `available` from `useAvailableBalance(userId)` and feed that as `walletBalance` to the dialog/sheet props. Delete the local wallets-table fetch.

### 3. Remove the cached prop on Supporter dashboard cards

`src/components/dashboards/SupporterDashboard.tsx` lines 451 and 474 still pass `wallet?.balance` from `useWallet()`. Switch to `useAvailableBalance().available`. Same for `TenantDashboard.tsx` (line 275) and `LandlordDashboard.tsx` (lines 87/90).

### 4. Tighten the build guard

`scripts/guard-frontend-ledger-writes.mjs` already blocks `.from('wallets').select('balance|...')` in user-facing paths. Extend it to also block:

- `wallet?.balance` and `wallet.balance` reads inside the same user-facing globs
- imports of `useWallet` from those globs (force them to use `useAvailableBalance` or `useAgentBalances`)

Allowlist remains operator paths (`cfo`, `financial-ops`, `manager`, `executive`, `admin`, `ceo`, `coo`, `cto`, `hr`, `crm`, `cmo`, `reconcile`).

### 5. Update the memory rule

`mem/architecture/user-facing-wallet-view.md` — add the now-migrated files to the "in scope" list and remove `useWallet` from the "out of scope" exception (it is now strict-by-construction).

---

## Part B — CFO/FinOps "Cache Sweep" deduction

### 6. New edge function: `wallet-cache-sweep`

`WalletDeductionPanel` today only deducts the **withdrawable** bucket (strict ledger). It cannot retract cached phantom amounts that exceed the strict ledger or sit in the float bucket. Add a sister function `wallet-cache-sweep` that:

- Requires CFO or FinOps role (RPC `has_role`)
- Takes `target_user_id`, `bucket` (`withdrawable` | `float` | `balance_total`), `amount`, `reason` (≥10 chars)
- Computes `phantom = cached_bucket − strict_ledger_bucket` (clamped ≥0)
- Hard-caps the requested amount at `phantom` (cannot ever touch real customer-owed money)
- Posts a balanced ledger pair in the `admin_correction` classification, category `system_balance_correction`, with `entries` describing source + reason
- Triggers `apply_wallet_movement` so the cache mirror updates atomically
- Logs to `audit_logs` (`action_type='cache_sweep'`, mandatory reason) and emits `system_event` `wallet.cache_sweep.applied`
- Records in `wallet_overdraw_events` if the operator typed an amount above `phantom` (rejected with 422)

This is the only path that may reduce a cache figure without a corresponding real money movement.

### 7. New CFO panel: `CacheSweepPanel.tsx`

Lives in `src/components/cfo/`. UI:

- Reads `wallet_strict_drift_view` (already exists) to list every wallet where `cached − strict > UGX 1`
- Per row: shows name, phone, cached withdrawable, cached float, strict withdrawable, strict float, **phantom delta** per bucket
- "Sweep" button per bucket → confirm modal with required 10-char reason → calls `wallet-cache-sweep`
- Bulk action: "Sweep all phantom withdrawable < UGX X" with mandatory reason (CFO-only)
- Live refresh via realtime on `wallets` + `general_ledger`

Mount inside `CFOReconciliationPanel.tsx` as a new tab "Cache Sweep" beside `AnchoredCacheDriftPanel` and `PhantomDriftPanel`.

### 8. Extend `WalletDeductionPanel` for FinOps cache visibility

The existing FinOps deduction tool already strict-clamps. Add a small "Cache phantom: UGX X" badge next to each row when `cached_withdrawable − strict > 1`, with a "Open in Cache Sweep" link that deep-links to the CFO panel (FinOps gets a read-only view; the sweep button is CFO-only by RLS / role check).

---

## Database surface

No schema changes required for Part A. Part B adds:

- One edge function (`supabase/functions/wallet-cache-sweep/index.ts`)
- Optional view `v_wallet_cache_phantom` (cached − strict per bucket) for fast paged listing — can also be done in-app from `wallet_strict_drift_view`. Will pick the view if pagination performance matters at 40M scale.
- No new tables; reuses `audit_logs`, `system_events`, `wallet_overdraw_events`.

---

## Acceptance

```text
End user (any role)
 └─ opens wallet card  → number = get_user_wallet_view.withdrawable
 └─ opens any pay/invest dialog → max = same RPC
 └─ build guard fails CI if a user-facing file imports useWallet or reads wallet.balance

CFO
 └─ Reconciliation → Cache Sweep tab
 └─ sees all wallets with cached > strict, per bucket
 └─ can deduct up to phantom amount with reason
 └─ ledger entry posted in admin_correction classification
 └─ system_event wallet.cache_sweep.applied emitted

FinOps
 └─ WalletDeductionPanel shows "phantom" badge
 └─ deduct still strict-only (unchanged)
 └─ deep-link to CFO Cache Sweep for the actual cleanup
```

After this ships, the only place a cached wallet number appears in the product is operator dashboards — and the only way to reduce it without real money moving is the audited Cache Sweep path.

