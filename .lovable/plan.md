## What's broken

Agent **Akampurira Onesmus** can't allocate UGX 20,000 to tenant Beinobwengye Simon. The error in the UI ("new row for relation 'wallets' violates check constraint 'wallets_balance_check'") is the raw Postgres trigger response and tells the agent nothing useful.

### The actual cause (verified against live DB)

| Metric | Value |
|---|---|
| Agent's wallet ledger total (`ledger_scope=wallet`) | **UGX 1,121,133** |
| Agent's cached `wallets.balance` | **UGX 9,300** |
| Agent's cached `wallets.float_balance` | **UGX 0** |
| Agent's "commission locked" per RPC formula | **−6,265,500** (clamped to 0) |
| Allocation requested | UGX 20,000 |

Two compounding bugs:

1. **Anchored cache drift (float side).** `wallets.balance` is stale at 9,300 while the ledger says 1,121,133. The wallet sole-writer trigger correctly refuses `9,300 − 20,000 = −10,700`. We already have an anchored-drift fix for `withdrawable_balance` (`reseed_anchored_withdrawable` RPC + `wallet_anchored_drift_view`), but the same drift exists on `balance` / `float_balance` with no reseed path.
2. **Commission accounting is broken — the RPC clamps it.** The agent has UGX 6.27M more `agent_commission_used_for_rent` / `wallet_withdrawal` debits than `agent_commission_earned` credits. The RPC does `GREATEST(0, v_commission)`, so the float-vs-commission gate passes when it shouldn't, and the trigger downstream is the only thing catching the drift.

The screen showing "Float after UGX 1,101,133" is the **ledger-derived** number — agents see a healthy float that doesn't actually exist in the wallet cache, then get punished by the constraint.

## Fix (3 parts)

### 1. Extend the anchored-drift fix to the full balance (DB migration)

- Add `wallet_anchored_balance_drift_view` modeled on the existing withdrawable view, comparing `wallets.balance` against the ledger sum for `ledger_scope='wallet'`.
- Add `reseed_anchored_balance(p_user_id uuid)` RPC: if cache is **lower** than ledger, raise it to the ledger figure (mirrors the strict rule — caches can never inflate withdrawable beyond ledger, and conversely cannot understate `balance` below ledger). Same `sync_authorized` session-flag pattern as the existing reseed.
- Wire `agent_allocate_tenant_payment` to call `reseed_anchored_balance(p_agent_id)` **before** the float check, so we self-heal at the moment the agent tries to spend.

### 2. Replace `GREATEST(0, ...)` with a real solvency gate (DB migration)

In `agent_allocate_tenant_payment`:

- Compute `v_commission_raw` (no floor) and `v_commission := GREATEST(0, v_commission_raw)`.
- If `v_commission_raw < 0`, that means commission accounting is corrupted for this agent. Return a structured error (`error_code: 'COMMISSION_LEDGER_INCONSISTENT'`) and write a row to a new `wallet_commission_drift` diagnostic table for FinOps to triage. **Do not silently allow the allocation** — silent allow is what got us here.
- After posting ledger legs, do a defensive `SELECT balance FROM wallets WHERE user_id = p_agent_id` and bail with a clean error if it would have gone negative. (Belt + suspenders behind the trigger.)

### 3. Surface a human error, not raw Postgres (frontend)

In `src/components/agent/AgentTenantCollectDialog.tsx` (line ~258), map known DB error fragments:

- `wallets_balance_check` → "Your wallet float is out of sync with the ledger. We've flagged this for review — please retry in a moment, or contact support if it persists."
- `COMMISSION_LEDGER_INCONSISTENT` → "Float allocation paused — your commission ledger needs reconciliation. Support has been notified."
- Default → keep current message but strip the `new row for relation "wallets"...` jargon.

Also call `reseed_anchored_balance` once on retry so the next click typically just works.

### One-time backfill for this agent (after migration is approved)

Run `reseed_anchored_balance('e3cf4d3a-d021-49e4-b815-7e1938166eeb')` once so Akampurira can allocate immediately, then run the same RPC across all agents whose `wallets.balance < ledger total` to pre-empt other stuck agents.

## Files / artifacts

- New migration: `wallet_anchored_balance_drift_view` + `reseed_anchored_balance` RPC + updated `agent_allocate_tenant_payment` + new `wallet_commission_drift` table.
- `src/components/agent/AgentTenantCollectDialog.tsx` — humanize error mapping and add automatic reseed-on-retry.
- Memory update: extend `mem://architecture/anchored-cache-drift` to cover `balance` not just `withdrawable_balance`.

No UI redesign, no schema changes outside the wallet/ledger surface area. Aligned with the existing wallet sole-writer + anchored-drift architecture.
