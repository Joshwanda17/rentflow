## Goal

Today every verified field deposit batch credits the agent's **float** (and the tagged-item loop allocates rent + pays 10% commission). You want the agent to declare, at submission time, that the batch is either:

- **Operational float** — current behavior, money belongs to the company / will be used to settle tenants
- **Personal withdrawable** — the agent is depositing their *own* money into their personal wallet (no tenant allocation, no commission)

The Fin Ops verify dialog will surface that choice and, on approve, the RPC routes the entire `declared_total` into the chosen bucket.

## Changes

### 1. Database (migration)

- `field_deposit_batches.target_bucket text` — values `operational_float` | `withdrawable`, default `operational_float` (preserves all legacy rows + behavior).
- CHECK constraint on the two allowed values.
- Update `process_verified_field_deposit(p_batch_id, p_finops_user, p_finops_proof_entered)`:
  - Branch on `v_batch.target_bucket`.
  - **`operational_float`** → unchanged (current loop: float credit + per-tenant allocation + 10 % commission + surplus to float).
  - **`withdrawable`** → skip the items loop entirely; require `tagged_total = 0` (refuse if the agent tagged tenants — wrong mode); post a single ledger transaction crediting the agent's **withdrawable** bucket for `declared_total` using `recipient_type='user'` and category `agent_personal_deposit` (added to the routing config so it maps to withdrawable). Audit row `event='allocation_completed'` with `details.mode='withdrawable_topup'`.
- Ensure `agent_personal_deposit` is whitelisted in the ledger category allowlist + routes to `withdrawable` in `wallet_route_for_category`.

### 2. Agent submission UI — `FieldDepositWizardDialog.tsx`

- New Step 1 control: **"Where should this money go?"** with two cards:
  - **Operational float** (default) — "Rent I collected from tenants. Tag tenants on the next step."
  - **My withdrawable wallet** — "My own money. Skip tenant tagging."
- When `withdrawable` is selected: skip Step 2 entirely (jump to Step 3 proof), and don't pass any `collectionIds`.
- Pass `targetBucket` through `createBatchWithItems` → insert column.

### 3. `src/lib/fieldDepositBatches.ts`

- Add `target_bucket: 'operational_float' | 'withdrawable'` to `FieldDepositBatch` + `PendingBatch`.
- Add `targetBucket` to `CreateBatchInput`; include in the insert payload.

### 4. Fin Ops verify dialog — `FieldDepositVerifyDialog.tsx`

- Surface the target as a prominent badge in the summary card: "Credits → Operational float" or "Credits → Personal withdrawable".
- When `withdrawable`: hide the tenant-items + commission breakdown sections (they don't apply); rename the verify button to **"Verify & credit withdrawable"**; update the explainer copy.
- No selector here — the agent's choice is binding. (You picked "Agent picks it when submitting".)

### 5. Edge function `verify-field-deposit`

- No code change needed — it just forwards to the RPC which now branches internally.

## Out of scope

- Existing rows keep working (default `operational_float`).
- No change to rejection / reopen flow.
- No change to commission rate config.

## Verification

- Migration applies cleanly; existing pending batches stay in `operational_float` mode.
- Submit a new batch with **withdrawable**: agent sees 2-step flow, no tenant tagging; Fin Ops sees "Credits → Personal withdrawable"; on approve, only one wallet credit lands in `withdrawable_balance`, no `agent_landlord_float_allocations` / `agent_collections` / `agent_earnings` rows are inserted.
- Submit with **operational float**: identical to today's behavior.
