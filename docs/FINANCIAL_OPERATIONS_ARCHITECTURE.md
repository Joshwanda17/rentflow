# Financial Operations (FinOps) Architecture Manual

**Audience:** CTO, CFO, Finance Team, Auditors, Engineers, Compliance Officers, future AI assistants.
**Status:** Reverse-engineered from the live database (`wirntoujqoyjobfhyelc`) and the repository at the date of writing. Every claim is marked **[observed]** (verified by direct query / file read) or **[inferred]** (deduced from naming or partial evidence).
**Scope:** the dual-persona FinOps surface — the Financial Ops Command Center (`src/components/financial-ops/`, ~74 files) and CFO Strategic Controls (`src/components/cfo/`, ~93 files) — plus ~75 finance-critical Edge Functions, ~180 SECURITY DEFINER finance RPCs, 34 `general_ledger` triggers and the pg_cron fleet.

> **Read this first — three verified defects that undermine the control model.**
> 1. **`admin_reseed_wallet_cache` is an arbitrary money-write primitive.** SECURITY DEFINER, **no role check**, sets `wallet.sync_authorized='true'` to defeat `enforce_wallet_ledger_only`, overwrites any user's `balance`/`withdrawable_balance`, resets the flag. ACL grants EXECUTE to **`anon` and `authenticated`**. **[observed]**
> 2. **`begin_wallet_accrual_lock` / `end_wallet_accrual_lock` have no authorization** and PUBLIC EXECUTE. `wallet.accrual_lock='on'` is an absolute block on all wallet mutation, set with `is_local=false` (session-persistent). Any caller can freeze wallet updates platform-wide. **[observed]**
> 3. **Nine cron jobs are `active=false` and stale**, including `process-debt-recovery-daily`, `daily-recalculate-credit-limits`, `check-agent-liquidity-hourly`, `refresh-financial-summaries-daily`, `process-promissory-deductions-daily`, `partner-ops-automation-daily`. Recovery and credit-limit maintenance are silently not running. **[observed via `cron_jobs_health()`]**

---

## 1. Scope and Persona Split

| Tier | Location | Entry point | Purpose |
|---|---|---|---|
| Financial Ops | `src/components/financial-ops/` (~74 files) | `FinancialOpsCommandCenter.tsx` (922 lines) + `FinancialOpsPulseStrip.tsx` | Day-to-day cashier/verification desk: deposits, withdrawals, email auto-match, requisitions, reconciliation review |
| CFO / Treasury | `src/components/cfo/` (~93 files), `src/pages/cfo/*` | `src/pages/cfo/Dashboard.tsx` | Executive/treasury: advances, payroll, ledger health, cash position, ROI, cron and anomaly monitoring |

`FinancialOpsCommandCenter` lazy-loads ~45 panels through an `lz()` helper so first paint stays fast, and by explicit **CFO mandate** (in-file comment) the home view exposes only two primary actions — *Verify Deposits* and *Withdrawals*; ~33 other tools live behind a "More" sheet. **[observed]** The command center performs **no route-level RBAC of its own**; it reads `useAuth()` only to namespace localStorage UI preferences. Authorization is the page wrapper's and each Edge Function's responsibility. **[observed]**

`FinancialOpsPulseStrip` renders 5 KPI tiles from a single `get_financial_ops_pulse()` RPC ("instead of 5 separate queries — handles 1M+ scale"). **[observed]**

## 2. The One Sanctioned Money-Movement Path

Every legitimate movement of value is a **balanced, multi-leg insert into `general_ledger` through the `create_ledger_transaction` RPC**. There is no second sanctioned writer.

`create_ledger_transaction(entries jsonb, idempotency_key text DEFAULT NULL, skip_balance_check boolean DEFAULT false)` — canonical. A legacy 4-arg overload `(p_transaction_group_id, p_entries, p_idempotency_key, p_skip_balance_check)` exists and **deliberately discards the passed group id** ("the transaction group id argument is intentionally ignored") before delegating. **[observed]**

Behaviour, in order:
1. `set_config('ledger.authorized','true', true)` — satisfies the `enforce_ledger_rpc_only` guard for the ensuing inserts. This is transaction-local.
2. **Idempotency:** `pg_advisory_xact_lock(hashtext(idempotency_key))`, then look up an existing group by that key and **return it unchanged** if found. Idempotent replay, never an upsert.
3. **Entry contract** per array element: `user_id, category, direction ('cash_in'|'cash_out'), amount, ledger_scope, recipient_type?, wallet_bucket?, classification?, description, reference_id, source_table, source_id, currency, account, transaction_date, solvency_bypass_reason?`.
4. **Isolation rule:** for `ledger_scope='wallet'` with category in `agent_repayment, agent_advance_repayment, salary_advance_repayment, debt_recovery`, `recipient_type` is **mandatory**; violations are logged to `wallet_routing_violations` and raise `check_violation`.
5. **Bucket resolution:** explicit `wallet_bucket` wins; else `operational_wallet → float`, `user → withdrawable`.
6. **Balance enforcement** only when `NOT skip_balance_check AND ledger_scope='wallet' AND user_id IS NOT NULL AND effective_bucket='withdrawable'`. It derives a strict ledger net since the user's `wallet_fresh_start_anchors.anchor_at`, limited to `classification IN (NULL,'production')`, then enforces `LEAST(cached_withdrawable, strict_net)` — **the cache can only lower the ceiling, never raise it.** Shortfall raises `Insufficient ledger balance`.
7. Hard assertion that `SUM(cash_in) = SUM(cash_out)` across the whole array.
8. One row per entry, all sharing one freshly generated `transaction_group_id`.

**[all observed]**

## 3. `general_ledger`: Shape, Classification, Immutability

31 columns. Notable: `transaction_group_id` (default `gen_random_uuid()`), `ledger_scope` (default `'wallet'`), `classification` (plain **text**, not an enum), `idempotency_key`, `recipient_type`, `wallet_bucket`, `routing_source`, `solvency_bypass_reason`, plus a maturity family (`withdrawable_after, maturity_condition, maturity_met, maturity_subject_id, maturity_expired, matured_at`). **[observed]**

`solvency_bypass_reason` **is** a real enum, 8 labels: `legacy_offline_paid, write_off, admin_correction_seed, legacy_real_backfill, dispute_resolution, regulatory_adjustment, duplicate_reversal, other_with_note`. **[observed]**

Live distributions **[observed]**:

| Dimension | Values |
|---|---|
| `classification` | `production` 360,306 · `admin_correction` 8,532 · `legacy_real` 2,797 · `test_dev` 676 |
| `ledger_scope` | `wallet` 187,212 · `platform` 174,444 · `bridge` 10,655 |
| Volume | 372,311 rows across 182,692 distinct groups; 187,491 rows carry an idempotency key |
| `wallet_bucket` | `''` 337,381 · `withdrawable` 25,461 · `float` 9,469 (of which 9,465 are `recipient_type='operational_wallet'`) |

**RLS is deny-all for client writes:** `no_deletes` (UPDATE qual `false`), `no_updates`, `no_direct_inserts` (with_check `false`). SELECT is limited to execs (cfo/coo/ceo), managers, and self via `is_customer_wallet_history_visible`. No client can write a ledger row through PostgREST at all. **[observed]**

## 4. The 34 `general_ledger` Triggers

Grouped by function. **[all observed via `pg_trigger` / `pg_get_triggerdef`]**

**Write authorization / immutability**
- `trg_enforce_ledger_rpc_only` → `enforce_ledger_rpc_only` — requires `ledger.authorized='true'` unless (a) a maintenance window is open (`ledger_maintenance_state.open_until`), logged as `ledger_maintenance_write`, or (b) break-glass `ledger.bypass_guard='true'`, logged as `ledger_guard_bypass`. **The break-glass path contains no role check of its own.**
- `trg_prevent_ledger_update` / `trg_prevent_ledger_delete` → `prevent_ledger_mutation` — append-only enforcement.
- `trg_guard_ledger_write` → `guard_ledger_write` — same `ledger.authorized` check with no carve-outs.

**Double-entry and classification integrity**
- `trg_enforce_ledger_group_balance` (**AFTER, DEFERRABLE INITIALLY DEFERRED**) — at commit, each `transaction_group_id` must net to exactly zero. `system_balance_correction` groups may mix `production` + `admin_correction` and still must net zero; mixing those classifications outside a correction group is forbidden. Governed by `ledger_integrity_config.enforce_from`.
- `trg_enforce_correction_classification`, `trg_enforce_production_april_cutoff` (forces `production` for `transaction_date >= 2026-04-01` unless already `admin_correction`), `trg_validate_ledger_category`.

**Routing**
- `trg_set_wallet_bucket_from_recipient_type`, `trg_assert_wallet_routing` (raises `WALLET_ROUTING_REQUIRED` when no bucket resolves), `trg_auto_ledger_scope`, `zz_enforce_wallet_scope_requires_user`, `general_ledger_route_buckets`, `trg_enforce_managed_proxy_roi_routing`.

**Anti-fraud / retired-path blocks**
- `trg_block_legacy_wallet_deduction` (rejects `category='wallet_deduction'`, retired 2026-05-01 in favour of `cfo-direct-credit` + `cfo_debit_obligations`), `trg_block_merchant_agent_auto_debit`, `trg_block_proxy_custody_writes`, `trg_block_retired_instant_house_reward`, `trg_enforce_no_fraud_wallet_earnings`, `trg_enforce_no_negative_wallet_ledger`, `trg_enforce_single_rent_disbursement`, `trg_enforce_tid_deposit_uniqueness`, `trg_verify_advance_disbursement`.

**Projections and side-effects**
- `trg_wallet_projection_ledger` → `tg_refresh_wallet_projection_on_ledger`, `trg_wallet_projection_maturity`, `trg_ledger_pivot_apply`, `trg_ledger_running_balance`, `trg_sync_wallet_from_ledger`, `trg_apply_bonus_restriction`, `trg_recover_advance_arrears_on_earning`, `trg_notify_agent_commission_paid`, `trg_log_ledger_wallet_transfer`, `trg_ensure_depositor_profile_on_credit`, `trg_general_ledger_supporter_capital`.

## 5. Wallet Architecture: Truth, Cache, and Two Dead Writers

`wallets` is a **VIEW**, not a table:
```sql
SELECT wp.id, wp.user_id, COALESCE(p.total_visible,0) AS balance, wp.created_at, wp.updated_at,
       wp.locked_balance, wp.currency, COALESCE(p.withdrawable,0), COALESCE(p.float_balance,0),
       COALESCE(p.advance_balance,0)
FROM wallets_physical wp
LEFT JOIN wallet_balances_projection p ON p.user_id = wp.user_id;
```
`wallets_physical` holds only identity/`locked_balance`/`currency`. **No bucket truth lives in any table.** Two `INSTEAD OF` triggers (`wallets_view_instead_of_insert/update`) redirect writes to `wallets_physical`. **[observed]**

`wallet_balances_projection`: `user_id (pk), withdrawable, float_balance, advance_balance, pending_holds, restricted_held, total_visible, ledger_version, updated_at`. **[observed]**

### Two dead writers — a live documentation hazard
- `sync_wallet_from_ledger()` is an **intentional no-op** whose comment (dated 2026-04-23) claims *"apply_wallet_movement() is now the sole writer to wallets.balance"*. **[observed]**
- **Both** `apply_wallet_movement` overloads are also neutered. The 4-arg version only calls `wallet_route_for_category` for diagnostics (logging to `wallet_unrouted_movements`) then `INSERT INTO wallets_physical (user_id) ... ON CONFLICT DO NOTHING`. The 5-arg version additionally validates `recipient_type` and `assert_routing_compatible`, logging failures to `wallet_routing_violations` with `source:'apply_wallet_movement_v2_neutered'` — the name documents its own neutering. Neither routes a movement into a bucket. **[observed]**
- The **real** cache writer is `tg_refresh_wallet_projection_on_ledger` → `refresh_wallet_projection_for(NEW.user_id)`, fired AFTER INSERT for every `ledger_scope='wallet'` row. **[observed]**
- Consequence: `wallet-cache-sweep/index.ts`'s header comment ("cache mirror updates atomically via `apply_wallet_movement`") is **stale**, and so is `sync_wallet_from_ledger`'s. Two layers of comments point at dead code. **[observed]**

### The lockdown: `enforce_wallet_ledger_only`
No-ops when no bucket column changed; raises `insufficient_privilege` if `wallet.accrual_lock='on'`; otherwise permits the mutation **only** when `current_setting('wallet.sync_authorized', true) = 'true'`, else raises *"Wallet bucket mutation forbidden. Use create_ledger_transaction; balances are derived from the ledger only."* **[observed]**

## 6. Balance Reads and the "Cache Can Only Shrink" Invariant

| Function | Behaviour |
|---|---|
| `get_user_available_balance(uuid)` | Pure cache read of `wallet_balances_projection.withdrawable` |
| `get_user_float_available_balance(uuid)` | `GREATEST(0, float_balance)` from the **strict live** `user_wallet_strict()`; refactored earlier from 6.2s to 11ms |
| `user_wallet_strict(uuid)` / `v_user_wallet_strict` | Ledger-derived truth: `ledger_scope='wallet'`, `classification IN (NULL,'production')` (plus a narrow `system_balance_correction` debit carve-out), rows on/after `wallet_fresh_start_anchors.anchor_at`, bucketed by explicit `wallet_bucket` or `wallet_route_for_category`, **minus** pending `withdrawal_requests` holds (`pending/requested/manager_approved/processing/approved` not yet posted), every bucket clamped `GREATEST(0, …)`. The view also subtracts `restricted_held` for unmatured credits |

**[all observed]**

`wallet_ledger_baseline` and `wallet_fresh_start_anchors` are **tables, not functions**. The anchor marks a zero point after which strict computation begins; the baseline stores a per-user snapshot for write-down/reseed flows. **[observed]**

**Why the cache can only be swept down:** `reseed_anchored_withdrawable` computes `v_delta := GREATEST(0, cached_withdrawable − strict_available)` — structurally non-negative — logs it to `wallet_historical_drift_review`, then posts a balanced `system_balance_correction` / `admin_correction` pair with `skip_balance_check=true`. A cache *below* strict yields `v_delta < 1` → no-op. `admin_reseed_wallet_cache` also floors at 0. There is no code path that raises a cached bucket toward the ledger figure. **[observed]**

### `wallet_route_for_category` has two overloads — this matters
- **IMMUTABLE `(p_category, p_direction)`**: routes the float family (`agent_float_deposit/assignment/topup/funding/used_for_rent/used/settlement`, `agent_landlord_payout`, `rent_disbursement`, `rent_float_funding`) → `float`; `agent_advance_credit`/`salary_advance` credits → `advance_credit`; `agent_advance_repayment`/`salary_advance_repayment`/`debt_recovery` debits → `advance_repayment`; everything else → `withdrawable`. Raises on unsupported direction/category.
- **STABLE `(p_user_id, p_category, p_direction)`**: additionally checks whether the user holds an enabled `agent` role, and forces agent credits in (`cfo_direct_credit, pool_capital_received, partner_funding, supporter_capital, supporter_rent_fund, manager_credit`) into **float**. `wallet_transfer` was **removed from both agent lists on 2026-05-15** because forcing person-to-person transfers into float made transferred money non-withdrawable.

**[observed]** Engineers must know which overload a call site binds to; the agent-aware one silently changes destination buckets.

## 7. Broken Control: `apply_layer_a_writedown`

`apply_layer_a_writedown(p_user_id, p_dry_run=true)` is CFO/manager/service-role gated and reads a table **`phantom_wallet_drift` that does not exist in the live database** (verified by direct query and a cross-schema `pg_class` scan). Any invocation errors at its first `SELECT ... INTO`. Its intended logic — refuse if the user has unspent post-April production credits, else post a balanced `platform_loss_writeoff` admin_correction pair equal to `ABS(LEAST(strict_net,0))`, zero the anchor/baseline, mark the phantom row resolved — is dead. **Do not treat it as a working control.** **[observed]**

Note also that `src/pages/cfo/PhantomDriftDetail.tsx` and `PhantomCorrectionDriftPanel.tsx` read `get_phantom_correction_drift[_detail]` RPCs, which are a *different* mechanism and do work. **[observed]**

## 8. Operations Catalogue

Every FinOps operation funnels through `create_ledger_transaction`. The catalogue below is the observed inventory.

### 8.1 `cfo-direct-credit` — the central engine (998 lines)
Gated to `cfo | manager | super_admin | cto`. Service-role bypasses exist for `system_auto_debit` and `system_requisition_credit` (server-to-server callers). Requires **Routing v2** `recipient_type` (`user` | `operational_wallet`). Categorically **locks** `agent_float_deposit` to float and `agent_commission_earned` to withdrawable. Handles forced reversals via `solvency_bypass_reason` + `skip_balance_check:true`. Also inserts `cfo_debit_obligations` rows with `auto_recover`, where `trg_enforce_bucket_aware_obligation` rejects float-bucket obligations with `auto_recover=true` or a cross-bucket `recovery_source`. **[observed]**

### 8.2 Four functionally duplicate bucket-move tools
`admin-float-to-withdrawable`, `admin-withdrawable-to-float` (with overdraft-filler logic), `finops-wallet-move` (adds a `user_to_user` mode and an error-correction pull back to platform), and `ops-bucket-transfer` all perform the same conceptual user-level bucket reclassification, with **differing auth sets and category names**. `admin-float-to-withdrawable` is `cfo|manager|super_admin|cto`, posts leg 1 `cash_out`/`float`/`operational_wallet` + leg 2 `cash_in`/`withdrawable`/`user` with `skip_balance_check:true`, and is subject to `checkTreasuryGuard`. **This redundancy is the single largest consolidation opportunity in FinOps.** **[observed]**

### 8.3 Recovery and correction tools
`requisition-credit-retry`, `reverse-auto-routed-withdrawal`, `reverse-uncoded-deposits`, `sweep-payout-debits`, `wallet-cache-sweep` (documented as *"the ONLY path that may reduce a cached bucket without a corresponding real-money movement"*, restricted to `cfo|manager|super_admin`), `notify-wallet-reconciliation` (SMS only, batch tag `wallet-reconcile-2026-08-01`, supports `dry_run`). **[observed]**

### 8.4 Mandatory correction pattern
`system_balance_correction` + `classification='admin_correction'` + a `solvency_bypass_reason` is the required combination to pass the negative-ledger triggers. **[observed]**

### 8.5 Mark Not Funded
Agent path: `get_agent_reversible_allocations` → `agent_unallocate_tenant_payment` (in-window self-reversal) or `request_agent_unallocation` (older than 7 days, needs CFO). CFO path: `CFOUnfundingApprovals.tsx` → `cfo_decide_agent_unallocation`, which posts the same balanced reversal. Tables: `agent_unfunding_requests` (0 rows), `agent_tenant_float_reversals` (1 row, carries `commission_clawback`). **[observed]**

## 9. Float Management — Six Distinct Subsystems

All six share `general_ledger` as truth but have separate tables, RPCs and functions. **[all observed]**

### 9.1 Operational float
A **ledger tag, not a table**: `wallet_bucket='float'` + `recipient_type='operational_wallet'`. Company money parked inside individual users' wallets. Top categories inside the bucket: `agent_float_settlement` 6,265 · `rent_payment_for_tenant` 5,992 · `agent_repayment` 1,953 · `agent_float_used_for_rent` 1,161 · `agent_float_deposit` 822 · `agent_float_assignment` 189. **Nothing in the codebase lets a user withdraw from float**; the only exit is the CFO-gated reclass in §8.2. Supporting machinery: `operational_float_audit_log` (961 rows, jsonb before/after allocations), `v_operational_float_tid_duplicates`, `flag_operational_float_tid_duplicates`, `validate_operational_float_allocations`, `register_float_delivery_tid`.

### 9.2 Agent working-capital float
| Table | Rows | Notes |
|---|---|---|
| `agent_float_funding` | 974 | Written by `record-bank-float-transfer` (requires a bank TID; `super_admin|manager|cfo|operations`) and by `fund-agent-landlord-float`; unique-indexed on `rent_request_id` |
| `agent_float_limits` | **0** | Full caps/threshold infrastructure (`float_limit, collected_today, cash_on_hand, daily_txn_limit, is_paused`) exists but is **unpopulated** |
| `agent_float_withdrawals` | 1 | GPS-matched agent→landlord cash-outs (`gps_match`, `gps_distance_meters`) with two-stage review |
| `float_requests` | 198 | Agent-initiated top-ups; `notify-cfo-float-request` fans out the alert |

`assign-agent-float` is gated to `super_admin|manager|cfo|coo|operations`, checks the sender's own balance, posts an `agent_float_assignment` pair and writes `audit_logs`.

### 9.3 Agent-Landlord (LP) float — allocate → payout → reconcile
- **Allocate:** `fund-agent-landlord-float` (423 lines, `cfo|manager|super_admin`) refuses if the rent request is already `funded` (idempotency comment cites incident *"RR d723bc4d, 2026-07-29"* where "Batch: landlord float" double/quadruple-funded), enforces a unique live-allocation guard on `(rent_request_id, source='cfo_disbursement', status IN open/partially_paid)`, posts `rent_disbursement`/`rent_receivable_created` keyed `fund-agent-landlord-float:{rent_request_id}:float`, and pays a flat **UGX 5,000** agent bonus keyed `…:bonus`.
- **Balance is derived, not written.** `credit_float_on_funding()` is now a **no-op stub**: *"RETIRED 2026-07-30: agent_landlord_float.balance is derived from agent_landlord_float_allocations via trg_sync_landlord_float_from_allocation. Crediting here double-counted every CFO funding call."*
- **Payout:** `issue-landlord-payout-otp` (552 lines) → `verify-landlord-payout-otp` → `landlord-payout-disburse` (OTP freshness ≤120s, duplicate-payout block, `get_agent_lp_float_available` where *reserved = balance − in-flight `landlord_payouts`*). The LP float is **reserved, not debited**, at disbursal request; the real debit lands when FinOps' `approve-withdrawal` records the MoMo send. The payout is routed into the merchant queue as a `withdrawal_requests` row carrying `landlord_payout_id`.
- **Apply:** trigger `apply_landlord_payout_to_allocation()` matches the live allocation by `rent_request_id` then `tenant_id`, increments `paid_out_amount`, and stamps `landlord_payouts.allocation_applied_id` so the same payout is never applied twice as it moves through states.
- **Commission:** `post-float-payout-commission` pays 1% of `agent_float_withdrawals.amount`, idempotent on `(source_table, source_id, category='agent_commission_earned')`.
- **Reconcile:** `v_agent_landlord_float_reconciliation` (755 rows) compares the cached balance to `SUM(remaining_amount)` of open/partially_paid/return_pending allocations. Cron `reconcile-agent-landlord-float` (`17 * * * *`) runs `reconcile_agent_landlord_float_all(false, false, 'scheduled_scan','cron')` — **report-only, it does not auto-apply**. Live drift: **13 of 755 agents (1.7%)**.
- `agent_landlord_float_corrections` holds **1,723 rows** — by far the largest correction table on the platform, evidence of prolonged manual firefighting before the 2026-07-30 derived-balance fix.
- `agent_landlord_payouts` (0 rows) is a superseded CFO-approval variant; the live path is `landlord_payouts` (671 rows).

### 9.4 Merchant "float" — does not exist as a balance
There is **no `merchant_float` table**. Merchant agents claim rows from the generic `withdrawal_requests` queue (353 rows carrying `landlord_payout_id`: 348 completed, 6 rejected), surfaced by `MerchantClaimsLog.tsx`. Supporting routines: `get_merchant_float_network_status`, `is_merchant_agent`, `merchant_set_online`, `enforce_no_merchant_agent_auto_debit`, `pay_merchant_agent_referral_bonus`, `notify_merchants_new_withdrawal`.

### 9.5 Landlord payout pipeline
`landlord_payout_otp_challenges` 1,178 · `landlord_payout_otp_events` 2,122 · `landlord_payouts` 671. Status machine: `otp_verified → pending_merchant_payout → pending_finops_disbursement | awaiting_agent_receipt → disbursed | completed`, with `sla_deadline`, `escalated_at/reason`, `attempts`, `last_error`, FinOps fields (`finops_disbursed_by/at`, `finops_momo_reference`), receipt fields, and `allocation_applied_id`. `landlord-payout-sla-monitor` and `submit-landlord-payout-receipt` complete the loop. FinOps UI: `LandlordPayoutsQueue.tsx`.

### 9.6 Recoveries
`agent_unfunding_requests` (0), `agent_tenant_float_reversals` (1), `agent_landlord_float_corrections` (1,723). CFO UI: `CFOAgentOpsFloatSender.tsx`, `AgentFloatManagement.tsx`, `LandlordFloatAllocationsPanel.tsx`, `LandlordFloatReconciliationPanel.tsx`.
