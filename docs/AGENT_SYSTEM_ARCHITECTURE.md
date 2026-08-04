# Welile — Agent System Architecture

**Definitive Agent System Reference Manual**
Audience: engineers, operations, finance, auditors, future AI assistants.
Companion document: `docs/FINANCIAL_SYSTEM_ARCHITECTURE.md` (ledger/wallet invariants are defined there and assumed here).

> Method: reverse-engineered from the live Supabase schema (452 tables, ~1,074 functions, of which **74 agent-scoped tables/views** and **~230 agent-scoped RPCs**), all `supabase/functions/*` edge functions, `src/components/agent/*`, `src/pages/agent/*`, `src/components/executive/AgentOpsDashboard.tsx`, and migration history. Where a claim is an inference rather than an observed definition it is marked **(inferred)**.

---

## 1. Executive Summary

The Agent Module is the field-force layer of Welile. Agents are the humans who acquire landlords and houses, register tenants, post rent requests, disburse company money to landlords, collect daily rent, and (for merchant agents) settle user cash-outs from their own mobile-money balance.

Five things define the module:

1. **Agents never hold authoritative balances.** Everything an agent "has" is a projection of `general_ledger`. `wallet_balances_projection` (buckets: `withdrawable`, `float_balance`, `advance_balance`) and `agent_landlord_float.balance` are caches maintained by triggers.
2. **Two distinct floats.** *Operational float* (`wallet_bucket='float'`) is company money in the agent's wallet. *Landlord-Payout (LP) float* (`agent_landlord_float`) is money ring-fenced per rent request, derived from `agent_landlord_float_allocations`.
3. **Earnings are event-driven and idempotent.** 10% of rent collected (8%/2% split when a recruiter override applies), 1% on merchant transactions, plus flat bonuses (UGX 100 location capture, 2,000 listing, 2,000 LC verified, 5,000 landlord/rent-funded, 10,000 placement). Every credit carries an `idempotency_key`.
4. **Credit is single-slot.** An agent may hold exactly one live advance; growth happens through **top-ups**, not new advances. Missing a day creates **arrears**, it never compounds principal.
5. **Enforcement lives in the database.** ~230 `SECURITY DEFINER` RPCs plus 34 ledger triggers and dozens of column-level guards mean the client cannot mint money, self-report repayment, inflate principal, or edit protected fields.

**Known open risks (as of this document):** ~UGX 22M historical drift from 8,558 legacy `agent_commission_earned` rows lacking platform-side balancing legs; three failing cron jobs (`sweep-agent-advance-recovery`, `expire-stale-bonus-restrictions`, `recalculate-trust-scores-nightly`); a cadence conflict for `sweep-agent-advance-recovery` (15-min vs daily) across migrations; and two divergent access-fee formulas (simple vs compound).

---

## 2. Business Model

| Role | What they do | How they earn |
|---|---|---|
| **Agent** | Recruits landlords, lists houses, registers tenants, posts rent requests, pays landlords from float, collects daily rent | 10% of rent collected + flat event bonuses |
| **Senior agent** | Same, with higher per-tenant caps and larger float limits | Same, plus recruiter overrides |
| **Sub-agent** | Recruited by a parent agent; auto-verified at DB level | 8% of own collections (2% goes to parent) |
| **Merchant agent** | Cash-out only; pays users from own MoMo float | Principal + 0.5% commission, ~1% on merchant transactions |
| **Proxy/supporter agent** | Withdraws on behalf of partners | No commission; strictly gated |

Welile's unit economics: rent is funded to the landlord up-front; the tenant repays principal + a 33% access fee over a cycle. The agent's 10% is a cost of collection paid out of realised repayments, which is why commission **accrues** on allocation and **releases** on ledger-verified repayment.

---

## 3. Agent Identity & Lifecycle

States: `invited → registered → verified → active → (restricted | frozen) → dormant`.

- **Registration.** Self-signup or via referral link. `referralAttribution.ts` persists the referral code for 60 days so attribution survives app reloads and OTP detours.
- **Sub-agent registration** is **auto-verified at the database level**; the parent-agent invite flow still requires an acceptance token, so an invite is not a grant of capability.
- **Name verification.** `NameCompletionGate` requires ≥2 name tokens and rejects random-character strings before an agent can transact.
- **Phone verification.** `PhoneCollectionGate` + OTP; `MobileMoneyNameCard` captures the exact name shown on the agent's MoMo account so payouts reconcile against telecom statements.
- **Freeze.** `AgentFrozenGate.tsx` renders a full-screen red legal banner. Server-side, `enforce_agent_full_freeze` blocks INSERTs on `agent_collections`, `agent_receipts`, `agent_tasks`, `agent_visits`, `field_collections`, `offline_collection_submissions`, `property_viewings` — one trigger reused across seven tables.
- **Login-side revocation.** `revoke_agent_management_on_login` on `users` strips stale management privileges at session start.

## 4. Capabilities & Tiering

`agent_capabilities` enforces **11 fixed capabilities** (list-house, register-tenant, post-rent-request, collect-rent, pay-landlord, cash-out, order-merchandise, invite-sub-agent, capture-location, request-advance, transfer-tenant). Capability changes are applied asynchronously:

- `agent_capability_ops_jobs` / `_job_batches` — queued grants/revokes.
- `process-agent-capability-jobs` edge function, driven by a **30-second cron**.
- `agent_capability_ops_undo_snapshots` — rollback state for bulk operations.
- `agent_capability_ops_dead_letters` — failed jobs retained for manual replay.
- `sync_cashout_agent_capability` trigger on `cashout_agents` keeps merchant capability in step with merchant status.

`agent_tier` + `agent_tier_capabilities` drive per-tier ceilings. Tier assignment is scored, not manual (see §7).

## 5. Dashboard & Navigation Architecture

- `AgentHubTabs.tsx` — bottom tab bar. Supports a **restricted mode** so cash-out-only merchant agents see a reduced surface. The "Sub-Agents" entry was replaced by **Service Center** (`Store` icon).
- `AgentMenuDrawer.tsx` — full action catalogue, with explicit merchant-blocking filters.
- `/agent/service-center` — purchase items, view/suspend sub-agents, transfer tenants; backed by `get_agent_service_center()` and `SubAgentDetailSheet.tsx`.
- `UnifiedWalletHeroCard.tsx` — collapsible-by-default wallet card (framer-motion liquid morph).
- `floating-nav.tsx` — detached pill navigation shell shared across Tenant/Agent/Funder/Owner personas.
- Staff side: `src/components/executive/AgentOpsDashboard.tsx` hosts **35+ operational panels** grouped in a re-organised sidebar, fed by a single overview RPC to avoid N+1 fetches.

Security note: `LedgerEntryDetailDrawer.tsx` hides **Running Balance** from agents and end users; only finance/audit roles see it.

---

## 6. Earnings & Commission Engine

**Rates.**

| Event | Amount |
|---|---|
| Rent collected | 10% of collection |
| Rent collected, sub-agent with recruiter override | 8% agent / 2% parent |
| Merchant transaction | 1% |
| Merchant cash-out settlement | 0.5% + principal reimbursement |
| Contact location captured | UGX 100 (idempotent per contact, key `loc:<target_id>`) |
| House listing approved | UGX 2,000 |
| LC verified | UGX 2,000 |
| Landlord verified | UGX 5,000 |
| Rent request funded | UGX 5,000 (`RENT_FUNDED_BONUS`) |
| Tenant placement | UGX 10,000 |

**Accrual vs release.** Commission accrues when an allocation is created and releases to `withdrawable` only when a matching ledger repayment leg exists. `agent_earnings` carries a **"Deny direct earnings inserts"** RLS policy — the table is server-write only.

**Reversal.** `agent_unallocate_tenant_payment` claws back the 10% on both wallet and platform legs, within a 7-day window, once only (unique on `agent_tenant_float_reversals.original_transaction_group`).

**Arrears interception.** `recover_agent_arrears_from_credit()` intercepts new earnings and applies them FIFO to advances in arrears before they become withdrawable.

**Known legacy issue.** 8,558 `agent_commission_earned` rows predate the balanced-pair requirement and lack platform-side legs → ~UGX 22M reported imbalance. Historical only; new writes go through `create_ledger_transaction`.

## 7. Trust, Eligibility & Scoring

- `agent_visits` is the geo-attestation anchor; `agent_collections.visit_id` and `payment_tokens.visit_id` reference it.
- `agent_capture_contact_location()` writes address hierarchy to `profiles`, optionally inserts a visit, calls `capture_trust_signal()` (exception-swallowed, non-blocking), pays UGX 100 idempotently, logs `system_events`.
- `capture_trust_signal()` writes `agent_visits` + `venue_visits` + `audit_logs`, then `recompute_trust_score(tenant)`.
- `v_agent_daily_eligibility` exposes `expected_daily`, `paid_today`, `paid_yesterday`, `today_pct`, `yesterday_pct`, `effective_pct`; snapshotted nightly by `snapshot-agent-daily-eligibility` (`30 0 * * *`).
- `agent_per_tenant_max()` — tiered per-tenant lending cap from 7-day responsiveness: 0 active tenants → 500,000 (Starter); ≥0.70 → 6,000,000; ≥0.40 → 3,000,000; ≥0.10 → 1,000,000; else 0.
- `enforce_agent_daily_eligibility` and `enforce_agent_rent_request_capacity` triggers on `rent_requests` block posting beyond capacity.

**Operational trap:** "Today's Capacity" is coupled to the `agent_collections` table. If an agent collects but the row isn't written, the agent appears idle and loses capacity.
