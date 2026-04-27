# Eliminate Frontend Wallet & Ledger Mutations

## Goal

Make it impossible for the frontend to corrupt balances or create drift. After this refactor, every financial state change goes through a backend edge function that calls the canonical `apply_wallet_movement` / `create_ledger_transaction` RPCs. The UI sends intent, shows loading/error, and refreshes via the existing realtime `wallets` subscription only.

## Audit Result (already complete)

A full `src/**/*.{ts,tsx}` scan found **exactly 3 unsafe mutation sites** plus 2 safe zero-balance bootstrap inserts. Everything else under `.from('wallets')` / `.from('general_ledger')` is `.select()` (read-only) and stays untouched.

| # | File | Violation | Severity |
|---|------|-----------|----------|
| 1 | `src/components/wallet/BillPaymentDialog.tsx` | Single-leg `general_ledger.insert` + direct `wallets.update({ balance: balance - amount })` | P0 — guaranteed drift on every bill payment |
| 2 | `src/components/agent/ProxyPartnerFunds.tsx` (line 447) | Single-leg `general_ledger.insert` (`withdrawal_reversal`) on cancel — unbalanced transaction group | P1 |
| 3 | `src/components/cfo/AgentFloatManagement.tsx` (line 83) | Two-leg `general_ledger.insert` with `ledger_scope: 'bridge'`, no wallet movement | P1 |
| 4 | `src/components/financial-ops/FloatPayoutVerification.tsx` (line 172) | Two-leg commission `general_ledger.insert` written from client | P1 |

Bootstraps that **stay** (no drift — insert a wallet row with `balance: 0`):
- `src/hooks/useWallet.ts:109`
- `src/components/manager/AddBalanceDialog.tsx:77`

## Replacements — Backend Endpoints

Three new edge functions, each thin wrappers around the canonical RPCs:

1. **`pay-bill`** — for BillPaymentDialog
   - Input: `{ category, account_number, amount }`
   - Calls `apply_wallet_movement(direction='cash_out', category='bill_payment_<x>', ...)` against the user's `withdrawable_balance`
   - Returns `{ ok, ledger_ref }`

2. **`cancel-proxy-withdrawal`** — for ProxyPartnerFunds
   - Input: `{ withdrawal_id, reason }`
   - Validates caller is the linked proxy agent, sets `withdrawal_requests.status='cancelled'`, then calls `create_ledger_transaction` with a **balanced** reversal pair restoring the partner's ROI bucket. Writes the `audit_logs` + COO/Ops notifications server-side.

3. **`record-bank-float-transfer`** — for AgentFloatManagement
   - Input: `{ agent_id, amount, bank_reference, bank_name, notes? }`
   - Inserts the `agent_float_funding` row, then issues a balanced bridge-scope ledger pair via `create_ledger_transaction` (CFO clearing → agent float bucket). Writes audit log server-side.

For **FloatPayoutVerification**, no new function is needed — fold the 1% commission ledger pair into the **existing** `disburse-rent-to-landlord` edge function (which is already invoked on the same line 147) so commission posting happens server-side as part of the same transaction.

## Frontend Changes

For each of the 4 files:
- Delete the `.insert(...)` / `.update(...)` blocks entirely (no patching).
- Delete the surrounding pre-flight `wallet.balance < amount` math (server is the only authority).
- Delete `await refreshWallet()` and any `setWallet(...)` calls that follow a financial action — the existing `useWallet` realtime UPDATE subscription already pushes the new balance.
- Replace with a single `supabase.functions.invoke(<name>, { body: ... })` call wrapped in try/catch with toast error display and a loading state.

`useWallet.ts` itself needs no behavioural change — the realtime channel on `wallets` is already the single source of truth (lines 254–271).

## CI Guard

Add `scripts/guard-frontend-ledger-writes.mjs` invoked from `package.json` `prebuild`. It greps `src/**/*.{ts,tsx}` and **fails the build** if any of these patterns appear (with the two known-safe bootstrap lines whitelisted by file:line):

```
.from('wallets').update(
.from('wallets').upsert(
.from('wallets').delete(
.from('general_ledger').insert(
.from('general_ledger').update(
.from('general_ledger').delete(
```

This makes future drift-creating code physically un-mergeable.

## Validation Checklist (post-refactor)

- `rg "from\('wallets'\)\.(update|upsert|delete)" src` → 0 hits
- `rg "from\('general_ledger'\)\.(insert|update|delete)" src` → 0 hits
- `rg "wallet\.balance\s*[-+]" src` → 0 hits in mutation contexts
- Manual smoke: bill payment, proxy cancel, CFO float transfer, float payout verification → wallet UI updates within ~1s via realtime, no manual refresh
- CI guard intentionally fails when re-introducing a forbidden pattern

## Out of Scope

- Read-only `.from('wallets').select(...)` and `.from('general_ledger').select(...)` calls — these are reporting/dashboards and remain.
- Refactoring caching strategy in `useWallet` — already realtime-driven.
- Edge functions themselves (which legitimately mutate via service-role) — only frontend is locked down.

## Deliverables

1. 3 new edge functions deployed: `pay-bill`, `cancel-proxy-withdrawal`, `record-bank-float-transfer`
2. `disburse-rent-to-landlord` extended with commission ledger pair
3. 4 frontend files refactored (mutations deleted, replaced with `functions.invoke`)
4. `scripts/guard-frontend-ledger-writes.mjs` + `prebuild` hook
5. Confirmation summary listing each removed mutation and its replacement
