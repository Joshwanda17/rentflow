## Goal

Enforce strict backend authority for deposits. Every deposit credits **`withdrawable_balance` first**. Float funding becomes an explicit, backend-only **internal transfer** — never a hidden "sweep" inferred from a frontend-supplied purpose. The frontend keeps a `deposit_type` selector for UX (so the user expresses intent), but performs **zero routing, validation, or balance math** — it just sends `{ amount, deposit_type }` and waits for realtime.

## What's already correct (leave alone)

- `wallet_route_for_category('wallet_deposit', 'cash_in')` already returns `withdrawable / +1`. **No DB function changes needed.**
- The frontend ledger-write guard (`scripts/guard-frontend-ledger-writes.mjs`) is in place — `wallets.update` / `general_ledger.insert` are already physically blocked from `src/`.
- Realtime wallet subscription (`useWalletRealtime.ts`) already drives UI updates.
- `create_ledger_transaction` is the single ledger writer.

## What's broken (the actual drift surface)

`supabase/functions/approve-deposit/index.ts` (lines 352–472) contains an **"operational float sweep"** that:

1. Reads `deposit_purpose` from the request and looks up the user's role.
2. **Auto-routes** ambiguous agent deposits to float without the user asking.
3. Writes a second ledger pair using `agent_float_deposit` — which routes to the **float bucket** in the same wallet.
4. Inserts an `agent_float_funding` row to mirror the hidden movement.

This is exactly the "backend decides routing based on role + interpretation" pattern the user wants removed. It also bypasses the new strict contract: **all deposits → withdrawable, then explicit transfer**.

`DepositFlow.tsx` carries 5 purpose options, conditional UI, and per-tenant allocation logic that all feed `deposit_purpose` to the backend.

## Backend changes

### 1. Rewrite `approve-deposit` — single, unconditional flow

Every approved deposit becomes exactly **one** balanced ledger pair:

```
[wallet cash_in  wallet_deposit]  +  [platform cash_out wallet_deposit]
```

- **Delete** the entire "Operational Float Sweep" block (lines ~352–472).
- **Delete** `agent_float_funding` insert from this function (float funding is no longer a side-effect of a deposit).
- **Keep** the idempotency guard, the ledger-first ordering, and the rent-repayment auto-debit (rent auto-debit is policy, not routing — it still operates on `withdrawable_balance` after the credit lands).
- **Stop reading** `deposit_purpose` for routing. The column may still be stored for analytics but is no longer used to decide where money lands.

Result: a deposit of UGX 100k for an agent lands 100k in `withdrawable_balance`. Period.

### 2. New edge function: `transfer-to-float`

Handles the second, explicit step when a user (agent) wants float. Strictly backend-controlled.

Input:
```json
{ "amount": 50000 }
```

Logic:
- AuthN: extract caller from JWT. No `user_id` in body.
- AuthZ: caller must hold the `agent` role (look up `user_roles`). Non-agents get 403.
- **Backend validation** (frontend does none): re-read `wallets.withdrawable_balance` for the caller; reject with `INSUFFICIENT_WITHDRAWABLE` if `< amount`.
- Issue one balanced ledger pair using **existing** category `agent_float_deposit` (already routed to the float bucket by `wallet_route_for_category`):

```
[wallet cash_out agent_float_deposit ]  ← drains withdrawable
[wallet cash_in  agent_float_deposit ]  ← credits float
```

Wait — `wallet_route_for_category` currently routes both directions of `agent_float_deposit` to the **float** bucket. To make the transfer balance correctly within one wallet (drain withdrawable, credit float) we need two distinct categories:

- **Use existing** `wallet_deduction` (routes to `withdrawable`, signed by direction) for the cash_out leg.
- **Use existing** `agent_float_deposit` (routes to `float`) for the cash_in leg.

Both are already in the strict-mode allowlist and already routed correctly by the bucket router — no DB migration required. Pair them under the same `transaction_group_id` via a single `create_ledger_transaction` call so they post atomically.

- Insert one `agent_float_funding` row (`status: 'approved'`, source = `transfer-to-float`) for operational reporting.
- Audit log + `logSystemEvent('float_transfer_completed', ...)`.

### 3. Database — no migration needed

The router already enforces correct bucket routing for both categories used. No `wallet_route_for_category` rewrite, no schema change.

## Frontend changes

### 4. `src/components/payments/DepositFlow.tsx` — collapse to two intents

- Replace the 5-option `DepositPurpose` enum with `type DepositType = 'personal' | 'float'`.
- Remove `partnership_deposit`, `personal_rent_repayment`, `other` purpose tiles (their behavior was already a mirage — they all credited `withdrawable_balance`; the rent-repayment auto-debit happens regardless of purpose).
- For non-agents: the picker is hidden and `deposit_type='personal'` is sent. No choice, no logic.
- For agents: show two tiles — **Personal Top-Up** vs **Operational Float**. Picking Float just stores the choice; **no allocation UI, no per-tenant breakdown, no balance math**.
- Delete every `if (depositPurpose === 'operational_float')` branch (allocation grid, tenant lookup, validation gates) — these all encode routing logic in the client.
- Delete `walletBalance` prop usage for any pre-flight check; the component must not read `wallet.balance` to decide what's allowed.
- Submit path:
  ```ts
  await invokeEdgeFunction('submit-deposit-request', {
    body: { amount, channel, transaction_id, deposit_type }
  });
  ```
  (deposit-request creation stays as-is; only the `deposit_purpose → deposit_type` rename and the removed branches matter.)

### 5. New "Move to Float" action (agents only)

Small UI on the agent dashboard / wallet sheet:
- Input: amount.
- Action: `invokeEdgeFunction('transfer-to-float', { body: { amount } })`.
- No balance check, no `if (wallet.withdrawable < amount)` — the backend rejects with a structured error and `invokeEdgeFunction` already toasts it.
- No `setWallet`, no `refetchWallet` — `useWalletRealtime` handles the update.

### 6. Files to clean

- `src/components/payments/DepositFlow.tsx` — purpose enum collapse, delete allocation logic, delete pre-flight balance reads.
- `src/components/wallet/PendingMovesStrip.tsx`, `UserDepositRequests.tsx`, `FullScreenWalletSheet.tsx`, `DepositHistory.tsx`, `FinancialStatement.tsx`, `ReconciliationReviewScreen.tsx`, `DepositReviewTimeline.tsx`, `TidVerification.tsx`, `CollectFromReferenceDialog.tsx`, `PaymentConfirmationForm.tsx`, `PartnerWalletWidget.tsx`, `UserDetailsDialog.tsx`, `AgentDetailsDialog.tsx`, `AgentDashboard.tsx`, `lib/depositPurposeVisibility.ts` — these only **read** `deposit_purpose` for display. Map old values → `deposit_type` at the read boundary; no logic changes.

### 7. Strengthen the CI guard

Add three new forbidden patterns to `scripts/guard-frontend-ledger-writes.mjs` so future drift is impossible:

- `wallet\.(balance|withdrawable_balance|float_balance)\s*[-+]\s*` (no client-side balance math)
- `routeToFloat\s*\(`
- `validateBalance\s*\(`

Whitelist: read-only display formatters that contain literal `balance` substrings but no arithmetic.

## Validation checklist

- `rg "deposit_purpose.*===.*operational_float" src` → 0 hits in mutation/branching contexts (display-only mappers OK).
- `rg "wallet\.(balance|withdrawable_balance|float_balance)\s*[-+]" src` → 0 hits.
- A non-agent depositing 100k via any purpose → 100k lands in `withdrawable_balance`, 0 in `float_balance`.
- An agent depositing 100k → 100k lands in `withdrawable_balance` (no auto-sweep), regardless of selected `deposit_type`.
- An agent calling `transfer-to-float` with 30k → withdrawable −30k, float +30k, ledger has one balanced pair under one `transaction_group_id`, one `agent_float_funding` row.
- An agent calling `transfer-to-float` with more than their withdrawable → backend returns `INSUFFICIENT_WITHDRAWABLE`, no ledger entry, toast surfaces error, UI doesn't change.
- CI guard fails when re-introducing any forbidden pattern.

## Out of scope

- Existing approved deposits and the historical `agent_float_funding` rows they produced — leave alone, they're already balanced by their original ledger pairs.
- `record-bank-float-transfer` (CFO bank-to-agent funding) — already backend-only; no change.
- Withdrawal flows — orthogonal.

## Deliverables

1. `approve-deposit/index.ts` — sweep block deleted, single balanced credit only.
2. New edge function `transfer-to-float/index.ts`.
3. `DepositFlow.tsx` refactored — `deposit_type` of `'personal' | 'float'`, no routing logic, no balance math.
4. New "Move to Float" UI on agent wallet.
5. Display-only files updated to map legacy `deposit_purpose` → `deposit_type` at read time.
6. CI guard extended with 3 new forbidden patterns.
7. Confirmation summary listing every removed branch and its backend replacement.