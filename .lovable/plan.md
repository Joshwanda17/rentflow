# Welile Homes — Agent-Managed Rent Collection & Landlord Payout

## Goal
Make the operational Welile Homes model work: agents enroll tenants, tenant rent is collected through the Welile wallet (or allocated by the agent when the tenant has no phone), Welile takes 10% per month, and the landlord is paid the remaining 90% on a fixed day — either into their Welile wallet or, if they don't use it, into the agent's landlord-float wallet to hand over.

## Locked economics (from your answers)
- Landlord is charged **10%** → landlord receives **90%** of monthly rent.
- The agent's **2%** comes **out of Welile's 10%** → Welile net **8%**, agent **2%**, landlord **90%**.
- At enrollment, one month's rent is booked as **rent receivable × 12**, due each month.
- The 10% is charged **the moment** rent lands: tenant wallet deposit, or agent allocation for a phone-less tenant.
- Landlord is paid on a **fixed day-of-month** chosen at enrollment.
- Phone-less tenant allocation **reuses the existing agent landlord-float allocation** plumbing.

## What already exists (reused, not rebuilt)
- `welile_homes_subscriptions` — enrollment anchor (currently a savings record).
- `agent_landlord_float` / `agent_landlord_float_allocations` — landlord-float payout rail.
- `landlord_account_ledger` — admin receivable/payable sub-ledger.
- `general_ledger` + `apply_wallet_movement` — double-entry money movement + wallet buckets.
- Agent UI: `RecruitTenantWelileHomes`; Admin UI: `WelileHomesSubscriptionsManager` (Tenant Ops → Welile Homes).

## Data model changes

### 1. Extend `welile_homes_subscriptions`
Add: `agent_id`, `enrolled_by`, `has_smartphone` (bool), `landlord_uses_wallet` (bool), `payout_day` (1–28), `monthly_landlord_fee` (10% of rent), `receivable_total` (rent×12), `outstanding_balance`, `next_due_date`, `mode` (`'agent_collection'` default). Keep existing savings columns untouched for backward compat.

### 2. New table `welile_homes_monthly_dues`
The 12-month receivable schedule (one row per period):
`subscription_id, tenant_id, landlord_id, agent_id, period_month (date), amount_due, amount_collected, landlord_fee (10%), agent_commission (2%), welile_net (8%), landlord_net (90%), collection_status (pending/partial/collected), payout_status (unpaid/paid_wallet/paid_float), payout_date, ledger_transaction_id`. Idempotent unique `(subscription_id, period_month)`. Full GRANT + RLS (agent sees own, ops sees all, service_role all).

## Backend RPCs / functions

### `enroll_welile_home_tenant(...)` (SECURITY DEFINER, transactional)
One call from the agent flow: upserts the subscription, generates 12 `welile_homes_monthly_dues` rows, writes the `landlord_account_ledger` receivable, sets `next_due_date`/`payout_day`, emits `system_event` + trust signal. Rolls back fully on any error (fixes the multi-step partial-write problem).

### `welile_home_record_collection(subscription_id, amount, source)`
Called when money lands (tenant deposit **or** agent allocation). Applies amount to the earliest open due, and posts the balanced fee split to `general_ledger` using **allowlisted categories only**:
- Rent in → `rent_repayment`
- Landlord 90% payable → held, released on payout
- Welile 8% → `platform_service_income`
- Agent 2% → `agent_commission_payout` (credited to agent withdrawable via `apply_wallet_movement`)
Updates `outstanding_balance`, marks due partial/collected, emits event + trust signal.

### `welile_home_run_landlord_payouts(as_of_date)` (pg_cron daily)
For each collected due whose `payout_day` has arrived and `payout_status='unpaid'`:
- If `landlord_uses_wallet` → credit landlord wallet (recipient_type `user` → withdrawable) with the 90% net.
- Else → increment `agent_landlord_float` / open an `agent_landlord_float_allocations` row so the agent can withdraw and hand cash to the landlord.
Marks `payout_status`, stamps `ledger_transaction_id`. Idempotent.

## Integration points
- **Tenant deposit hook**: when a Welile Homes tenant's wallet deposit confirms, invoke `welile_home_record_collection` (10% charged immediately).
- **Agent allocation**: for a phone-less WH tenant, the existing float-allocation action also calls `welile_home_record_collection` so a no-account collection reduces the due balance identically.

## UI

### Agent — "My Tenants" → Welile Homes
New agent view (button next to My Tenants, mirrors `WelileHomesButton`): list of the agent's WH tenants with monthly rent, outstanding balance, current-month collection status, an **Allocate rent** action (phone-less), the agent's running **2% earnings**, and per-landlord payout status (wallet vs float-to-withdraw).

### Admin — Tenant Ops → Welile Homes
Extend `WelileHomesSubscriptionsManager`: add Agent, Receivable (×12), Outstanding, Payout day, and Landlord-payout status columns; filter to `mode='agent_collection'`; show totals (total receivable, collected this month, Welile 8% earned, pending landlord payouts).

## Technical notes / risks
- **Ledger category allowlist**: `platform_service_income`, `rent_repayment`, `agent_commission_payout`, `rent_facilitation_payout` are in the locked category set; I'll confirm each leg passes strict mode before posting.
- **Wallet sole-writer**: all wallet changes go through `apply_wallet_movement`; no direct bucket writes.
- **entries JSON**: raw array to `create_ledger_transaction`, never stringified.
- **Currency**: UGX only via `formatUGX`.
- The existing savings/5%-growth marketing copy stays as-is; the operational engine above is what actually moves money.

## Build order
1. Migration: extend subscriptions + new dues table (GRANT/RLS) + `enroll_welile_home_tenant`.
2. `welile_home_record_collection` + deposit/allocation hooks.
3. `welile_home_run_landlord_payouts` + pg_cron.
4. Agent "My Tenants → Welile Homes" view.
5. Admin manager extension.
6. Verify end-to-end with a psql dry-run of a full enroll → collect → payout cycle.
