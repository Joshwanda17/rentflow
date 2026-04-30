---
name: User-facing wallet view (hybrid model)
description: End-user wallet UIs read get_user_wallet_view RPC / v_user_wallet_strict view only. wallets.* cache stays for operator dashboards (CFO, FinOps, CEO, COO, CTO, HR, Manager, Executive). Build guard enforces the boundary.
type: feature
---
**Rule.** Any wallet number a regular end user sees (tenant, agent, supporter, landlord) MUST come from `get_user_wallet_view(user_id)` (or a hook that wraps it: `useAvailableBalance`, `computeLedgerAvailable`, `useAgentBalances`). The `wallets` table (`balance`, `withdrawable_balance`, `float_balance`, `advance_balance`) is operator-only and is consumed exclusively by CFO, Financial Ops, CEO, COO, CTO, HR, Manager, and Executive surfaces for reconciliation work.

**Why.** The `wallets.*` cache can drift above the strict ledger position (phantom drift, anchor windows, missing legacy posts). Showing the cache to end users caused "Insufficient ledger balance" errors at withdrawal time and eroded trust. Reconciliation dashboards explicitly need to see the cache to fix it — they keep using it.

**How to apply.**
- New user-facing wallet code: call `useAvailableBalance(userId)` for the headline available figure, or `supabase.rpc('get_user_wallet_view', { p_user_id })` for all four buckets in one call.
- Never write `.from('wallets').select('balance|withdrawable_balance|float_balance|advance_balance')` in any file under `src/components/wallet/`, `src/components/payments/`, `src/components/agent/`, `src/components/supporter/`, `src/components/tenant/`, `src/components/landlord/`, `src/components/dashboards/`, or `src/pages/{agent,supporter,tenant,landlord}/`.
- Operator dashboards (any path containing `cfo`, `financial-ops`, `manager`, `executive`, `admin`, `ceo`, `coo`, `cto`, `hr`, `crm`, `cmo`, `reconcile`) are explicitly allowlisted to read `wallets.*` directly.
- `scripts/guard-frontend-ledger-writes.mjs` enforces this at build time.

**Database surface.**
- View: `public.v_user_wallet_strict(user_id, withdrawable, float_balance, advance_balance, pending_holds, total_visible)` — derives every bucket live from `general_ledger`, excludes admin corrections (`category <> 'system_balance_correction'`) and float-bucket categories from withdrawable, honors `wallet_fresh_start_anchors`, subtracts pending withdrawal holds, clamps each bucket at 0.
- RPC: `public.get_user_wallet_view(p_user_id uuid) RETURNS jsonb` — `SECURITY DEFINER`, `search_path = public`, granted to `authenticated, anon, service_role`. Returns the row as a JSON object so the frontend gets all four numbers in one round-trip.

**In scope (already migrated 2026-04-30):**
- `src/lib/computeLedgerAvailable.ts` — calls RPC, no cache reads.
- `src/hooks/useAvailableBalance.ts` — calls RPC, no cache reads.
- `src/hooks/useAgentBalances.ts` — calls RPC for buckets, ledger query for commission display only.
- `src/components/agent/AgentManagedUsersSheet.tsx` — calls RPC.
- `src/components/dashboards/SupporterDashboard.tsx` — uses `useAvailableBalance` for the empty-wallet nag trigger.

**Explicitly out of scope (cache reads remain correct):**
- `src/components/executive/AgentDetailDialog.tsx`, `src/components/financial-ops/WalletDeductionPanel.tsx`, `src/pages/cfo/MoneyFlowTrace.tsx`, `LedgerHealthPanel`, `AnchoredCacheDriftPanel`, `PhantomDriftPanel`, `WalletReconciliationAuditPanel`, `LedgerReconciliationPanel`, `useWallet` hook (used by both ops and end-user surfaces — the ops consumers display the raw cache for reconciliation; end-user consumers must NOT use `wallet.balance` for headline figures, only for non-financial UI signals).
