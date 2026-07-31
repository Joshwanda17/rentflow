# BUSINESS_RULES.md — Welile Rule Book

**Companion to `SYSTEM_CONTEXT.md`.** That document explains *how the system is built*; this one states *what the system is allowed to do*. Every rule below was read out of live code, live Postgres objects, or the project rule memory. Base currency is **UGX** everywhere, always rendered with the ISO code (`UGX 50,000`) — never `USh`, `Shs`, or `/=`.

Legend: **[INV]** invariant that must never be violated · **[CALC]** formula · **[GATE]** eligibility/approval condition · **[AMT]** fixed money amount.

---

## 1. Non-negotiable invariants

1. **[INV] Double-entry only.** `general_ledger` is the sole source of financial truth. Every transaction posts balanced legs (`cash_in` total == `cash_out` total) within one transaction group; `enforce_ledger_group_balance()` rejects anything else.
2. **[INV] Wallets are caches.** `wallets.*` are derived views of the ledger. `apply_wallet_movement(user_id, category, amount, direction)` is the ONLY writer of `balance / withdrawable_balance / float_balance / advance_balance`. `sync_wallet_from_ledger()` is a permanent no-op. Direct wallet UPDATEs are blocked by `enforce_wallet_ledger_only` unless the session flag `wallet.sync_authorized=true` is set by the ledger path.
3. **[INV] Three wallet buckets, distinct meanings.**
   - `withdrawable_balance` — the user's own money; only this bucket may fund a withdrawal.
   - `float_balance` — company money placed with an agent; never withdrawable as personal cash.
   - `advance_balance` — a liability owed to Welile; auto-recovered from incoming earnings.
4. **[INV] Routing is decided by `recipient_type`, not by role.** `user` → withdrawable; `operational_wallet` → float. The BEFORE INSERT trigger `trg_set_wallet_bucket_from_recipient_type` stamps `wallet_bucket` on every wallet-scope leg. Ledger *category* drives accounting only, never bucket.
5. **[INV] Strict withdrawable ceiling.**
   `available = max(0, min(wallets.withdrawable_balance, max(0, wallet_ledger_net)) − pending_holds)` via `get_user_available_balance(user_id)`. Caches, commission sums and baselines may only ever *reduce* the figure, never inflate it. Both the UI and `approve-withdrawal` gate on this same RPC.
6. **[INV] Advance recovery may only touch withdrawable.** `agent_repayment`, `agent_advance_repayment`, `salary_advance_repayment` and `debt_recovery` are blocked from `recipient_type='operational_wallet'` by `assert_routing_compatible` (raises `INVALID_ROUTING`).
7. **[INV] Peer transfers are shielded from sweeps.** Advance sweeps read `get_agent_sweepable_withdrawable`, which subtracts unspent incoming `wallet_transfer` credits. Never read `get_user_available_balance` inside an advance sweep.
8. **[INV] Every state change emits a `system_event`;** every user-observable action must also feed a `welile_trust_score_cache` factor (Trust Mission). Every agent field action must write `agent_visits` / `venue_visits` with geo + AI ID via `capture_trust_signal`.
9. **[INV] Roles live in `user_roles`,** never on `profiles`; checks go through the `has_role` security-definer function.
10. **[INV] Audit.** Sensitive mutations write `audit_logs` with `action_type`, `table_name`, `record_id` and a reason of **at least 10 characters**.
11. **[INV] Regulatory language.** "Rent Plan" not loan; "Supporter" not lender; "Returns" not ROI, in all user-facing copy.
12. **[INV] End-user wallet views** must exclude corrections: `.neq('classification','admin_correction').neq('category','system_balance_correction')`. Ops/CFO dashboards are exempt.
13. **[INV] Production cutoff.** Every `general_ledger` row dated ≥ 2026-04-01 is forced to `classification='production'` (only `admin_correction` may differ) by `trg_enforce_production_april_cutoff`.
14. **[INV] Idempotency.** Money-moving RPCs and edge functions must pass an idempotency key to `create_ledger_transaction(entries jsonb, idempotency_key text)`; `entries` is a raw JSON array, never stringified.

---

## 2. Rent Plans (core lending product)

### 2.1 Pricing formula [CALC]
```
Access fee        = round(rent × (1 + r)^(days/30) − rent)      r = 0.33 default (0.23 / 0.28 / 0.33 permitted)
Registration fee  = 10,000 if rent ≤ 200,000 else 20,000
Total repayment   = rent + access fee + registration fee
Daily repayment   = ceil(total repayment ÷ days)
Duration          = 7 – 120 days
```
Source of truth: `compute_rent_repayment(rent, days)`; TS mirror `src/lib/rentCalculations.ts`, locked by a 24-row reference test.

**[INV]** The BEFORE INSERT/UPDATE trigger `trg_enforce_rent_request_formula` silently overwrites the four fee fields — client-supplied fee values are always ignored. `submit-tenant-form` passes `0`; `validate-payload` treats them as derived.

Reference points: rent 50,000/30d → 76,500 total, 2,550/day · 250,000/30d → 352,500, 11,750/day · 500,000/90d → 1,196,319, 13,293/day.

### 2.2 Outstanding-balance (arrears) registrations
- `registration_type='outstanding_balance'` **skips** the formula: `access_fee = request_fee = 0`, `total_repayment = arrears`, `daily = ceil(arrears ÷ days)`.
- **[GATE]** No approval pipeline: auto-set `status='repaying'`, `tenancy_status='active'`, all review stamps set to `now()`.
- `next_charge_date = today + outstanding_grace_days`; `end_date = today + duration + grace`. Recurring rent is a *separate* future rent request — never bundled with arrears.

### 2.3 Approval pipeline [GATE]
`pending → agent_verified → tenant_ops_approved → agent_ops_approved → landlord_ops_approved → coo_approved → funded → repaying`. An agent may cancel their own in-review request (`status='deleted_by_agent'`). Landlord and LC1 chairperson must be verified for normal funding; unverified landlords queue the request with an explicit notice rather than a hard block.

### 2.4 Billing engine
Daily `subscription_charges` are drained by the `auto-charge-wallets` edge function on the `auto-charge-wallets-daily` cron (06:00). **[INV]** This cron is the ONLY producer of rent-driven agent commission — if it is inactive, commissions silently stop. Health is surfaced by `cron_jobs_health()` in the CFO Reconcile tab.

---

## 3. Agent commissions and bonuses

### 3.1 Rent commission [CALC]
Total commission = **10% of the repayment collected**, paid as money arrives (`credit_agent_rent_commission`, category `agent_commission_earned`, `recipient_type='user'` → withdrawable).

Splits:
| Situation | Source agent | Tenant manager | Recruiter override |
|---|---|---|---|
| One agent, no recruiter | — | 10% | — |
| One agent with recruiter | — | 8% | 2% |
| Separate source + manager | 2% | 8% | — |
| Source + manager + recruiter | 2% | 6–8% (remainder) | 2% |

Float-allocation collections (`agent_allocate_tenant_payment`) mirror this: a verified sub-agent earns **8%**, their parent recruiter **2%**; non-sub-agents keep the full 10%. Platform always expenses exactly 10%.

**[INV]** `agent_allocate_tenant_payment` reads the locked commission from `wallets.withdrawable_balance` — never re-sum ledger categories (drift inflates commission and zeroes float).
**[INV]** Every tenant-payment path must insert an `agent_collections` row, or the agent's daily capacity bar reads zero.

### 3.2 Event bonuses [AMT]
| Event | Amount | Condition |
|---|---|---|
| House listing verified | 2,000 | verification only, not submission |
| Landlord verified | 2,000 | verification only |
| LC1 chairperson verified | 2,000 | verification only |
| Recruiter override on sub-agent's verified listing/landlord/LC1 | 2,000 | idempotent, company-funded |
| Tenant placement bounty | 5,000 | paid to the **listing** agent when an empty listing first gets a `tenant_id` |
| Tenant replacement | 20,000 | |
| Sub-agent registration | 10,000 | only after the sub-agent has **≥ 3 verified** listings |
| Service centre setup | 25,000 | |
| Referral signup bonus | 500 | credited on signup via referral link |
| Weekly Listing Mission completion | 70,000 | see 3.4 |

### 3.3 Penalties [AMT]
- Landlord or LC1 chairperson rejected by Landlord Ops → **UGX 2,000** debited from the registering agent's withdrawable wallet (idempotent per record).
- House listing rejected → **UGX 6,000** debit.

### 3.4 Weekly Listing Mission [GATE]
Per Monday–Sunday week: 20 sub-agents invited, 20 activated (each with ≥3 verified houses that week), 60 verified houses. Earnings: 3,000 per verified house (recruiter override, paid live) + a one-time **70,000** completion bonus (`award_agent_listing_campaign_bonus`, idempotent per `agent_id, week_start`). Only the unearned 70k expires at week close.

### 3.5 Free service centre [GATE]
Permanent milestone: **20 qualifying sub-agents** (each with an active tenant) **plus 5 personal active tenants** unlocks a free service-centre request.

---

## 4. Agent eligibility law

### 4.1 Daily Eligibility Law [GATE]
```
expected_daily = Σ daily_repayment over funded/repaying, still-owing tenants   (v_agent_daily_eligibility)
paid_today / paid_yesterday = Σ agent_collections.amount in Africa/Kampala day buckets
effective_pct = max(today_pct, yesterday_pct)
```
Threshold **20%**. Below it, with ≥1 active rent, the agent is BLOCKED from posting new rent requests — enforced server-side by `tr_enforce_agent_daily_eligibility` (raises `DAILY_ELIGIBILITY_BLOCKED`), not just in the UI. System inserts bypass with `set_config('app.bypass_daily_eligibility','true', true)`.

Ratings: ≥75% Very Good · 20–75% Good · 15–20% Fair (blocked) · 5–15% Bad (blocked) · <5% Very Bad (blocked) · no active rents → Starter (always allowed).

### 4.2 Capacity caps [GATE]
- New agents (< **10** active tenants) are exempt from the daily law and capped at **UGX 2,000,000** per tenant.
- After graduating, the 7-day Daily Response Rate (DRR = responding tenant-days ÷ (active tenants × 7)) sets the per-tenant cap: ≥70% Positive → 6,000,000 · 40–69% Fair → 3,000,000 · 10–39% Bad → 1,000,000 · <10% Very Bad → blocked · Starter → 500,000.
- **Weekly good-standing unlock:** ≥2 days rated Good or better in the last 7 days → unlimited posting for the current week.
- Absolute platform ceiling per agent book: **UGX 100,000,000**.
- Tenants marked "Not Paying" are excluded from expected_daily and free the house back to Priority 1.

### 4.3 Listing window [GATE]
Agents, sub-agents and senior agents may only insert `house_listings` between **06:00 and 18:00 EAT** (`trg_enforce_daytime_house_listing`). Ops/executive roles bypass; service-role/system inserts bypass.

---

## 5. Agent advances (staff/agent working capital)

### 5.1 Pricing [CALC]
```
Access fee       = round(principal × (1.33^(days/30) − 1))     configurable 28%–33%, default 28% (advance_fee_config)
Registration fee = 10,000 if principal ≤ 200,000 else 20,000
Total payable    = principal + access fee + registration fee
Installment      = ceil(total ÷ installments)   periods: 7/14/30/60/90 days; daily (default) | weekly | biweekly | monthly
Daily accrual    = (1.33^(1/30) − 1) compounding on the outstanding balance
```

### 5.2 Rules [GATE]
- **One advance at a time**: `trg_enforce_no_double_agent_advance` blocks a new advance while one is active/overdue.
- Approval chain: agent request → Agent Ops → (CFO, skippable by Agent Ops "Skip CFO") → disbursement. CFO may edit the fee rate within 28–33% and the amount.
- **Missing a day does not increase the outstanding** — no penalty accrual for missed days.
- Voluntary prepayment is always allowed and consumes future installments.
- Recovery: `sweep_agent_advance_recovery()` every 15 minutes debits withdrawable FIFO (no extra interest) until settled, plus the 18:00 EAT `process-agent-advance-deductions` cron. Deduction cap = `min(sweepable withdrawable, outstanding)`. Zero-balance days emit `repayment_skipped_insufficient_balance`; SMS is sent on every actual deduction.
- Agents with prepaid installments are skipped by the sweep.

### 5.3 Business advances [CALC/GATE]
- **1% per day compounding** on the outstanding balance, open-ended (pay any amount, any time).
- Originating agent earns **4% of every repayment** (platform expense).
- Limit engine: Welile-scored from recorded rent history, **UGX 50,000 starter → 10,000,000 cap**.
- Staged approval: `pending → agent_ops_approved → tenant_ops_approved → landlord_ops_approved → coo_approved → cfo_disbursed → active → completed` (or `rejected`/`defaulted`).

### 5.4 Credit access draws [CALC/GATE]
- Platform fee **5% per month, compounding**: `fee = amount × (1.05^(days/30) − 1)`.
- Submission creates `status='pending_cfo'` only — **no wallet credit, no ledger entry**. A user may hold only one `active`/`overdue`/`pending_cfo` draw.
- `cfo-approve-credit-draw` (CFO/manager/super_admin) may edit amount and duration (1–12 months), re-validates against `credit_access_limits.total_limit`, recomputes fees, then credits **withdrawable**.

---

## 6. KYC, withdrawal and transfer limits

### 6.1 KYC levels (`kyc_level_config`, activity-driven, auto-upgrading)
| Level | Label | Unlock condition | Daily withdrawal cap | Withdrawals/day | Max single transfer | Agent | Merchant |
|---|---|---|---|---|---|---|---|
| 1 | Basic | default on signup (phone + PIN + T&Cs) | UGX 50,000 | 1 | UGX 50,000 | no | no |
| 2 | Verified | 1+ verified house listing, sub-agent, or funded rent request | UGX 500,000 | 10 | UGX 500,000 | yes | yes |
| 3 | Enhanced | 5+ verified in-app activities | UGX 999,999,999 | 999 | UGX 999,999,999 | yes | yes |

### 6.2 Other money-movement gates [GATE]
- New accounts (≤ 30 days old) are additionally capped at **UGX 50,000 withdrawn per day** (AML/anti-fraud).
- Peer-to-peer transfers require **10+ completed deposits** on the sending account, and an agent must satisfy the 20% collection gate.
- Withdrawals are funded strictly from `get_user_available_balance`; pending holds are subtracted; a withdrawal locks to "Processing" to prevent duplicates.
- Supporter capital withdrawals require a **90-day notice period**, during which Returns stop accruing.
- Signup anti-fraud: **1 signup per IP/device per 24 hours**; blocked identities live in `fraud_identity_blocks`.
- Wallet → platform debits go through CFO Direct Debit only (`cfo-direct-credit` operation `debit`). The legacy `wallet-deduction` function is retired (HTTP 410) and never creates debt rows.

---

## 7. Welile Trust Score and Vouch limit

### 7.1 Trust score (0–100, `get_user_trust_profile`) [CALC]
Weights: Supporter 30 · Payment 15 · Network 15 · Wallet 10 · Agent performance 10 · Verification 10 · Behavior 5 · Landlord 5. Score is the capped sum of the factor scores.

Tiers: `new` (fewer than 2 data points) · ≥80 excellent · ≥60 good · ≥40 standard · ≥25 caution · else high_risk.

Payment factor: `min(15, on_time_plans × 15 ÷ total_plans)`. Supporter factor scales by portfolio value (50k→1 … ≥100M→19) plus Returns history and active-portfolio count, capped at 30.

Cash-flow capacity = 90-day wallet flow normalised to 30 days + average monthly Returns.

### 7.2 Welile Vouch borrowing limit [CALC]
```
limit = 1× portfolio value
      + 2× angel-pool shares
      + boosters
boosters = min(200,000, wallet_score × 20,000)
         + min(150,000, network_score × 10,000)
         + min(500,000, agent_perf_score × 25,000) + agent_term
         + min(100,000, verification_score × 10,000)
         + min( 75,000, behavior_score × 15,000)
         + 0.30 × total_repaid + 0.25 × monthly_cashflow
```
Welile guarantees a borrower up to this limit; lender partners record the loan; defaults are paid by Welile and recovered from the borrower's wallet plus a trust-score penalty. The TS mirror `src/lib/vouch/computeVouchBreakdown.ts` is unit-locked — change both sides together.

---

## 8. Supporters, Returns and the Angel Pool

- Returns accrue on a **monthly flat-rate cycle**; a `roi_accrued` ledger entry is a prerequisite for any payout.
- **[INV] One Returns credit per portfolio per cycle.** Idempotency key `roi-cycle-<portfolio_id>-<next_roi_date>`, enforced at four layers: DB trigger `trg_enforce_roi_cycle_once`, `approve-wallet-operation` pre-check and race guard, client pre-flight, and list-level hiding.
- Returns always land in the **withdrawable** bucket. Payouts may be split between cash and principal reinvestment; auto-reinvested amounts never touch a wallet.
- Mid-cycle top-ups are parked in `pending_portfolio_topup` and require an explicit "Apply Top-up" merge.
- Contributed principal reporting excludes `roi_compounded`.
- **Managed-proxy routing [INV]:** when a partner has an active, approved `is_managed_account=true` proxy assignment, the wallet leg credits the **proxy agent**, `linked_party` = partner. Managed-proxy Returns cannot be split. Withdrawals debit the proxy wallet only.
- **Angel Pool:** 8% equity pool, **UGX 20,000 per share**, 25,000 shares, UGX 500,000,000 total. Agent commission **1%** of the investment, paid whether the investor or the agent funded it; shares always allocate to the investor.
- Supporter reward reference rate in the pricing helper: 15% of the rent facilitated.

---

## 9. Merchant (cash-out) agents

- A merchant settles a user withdrawal from their **own** MTN/Airtel float.
- On settlement `approve-withdrawal` posts: (1) full principal reimbursement to the merchant's withdrawable wallet, and (2) commission of **0.5% of the settled amount**.
- Float side posts two debits: the principal (`<wd>-merchant-float-consume`) and the **telecom sending charge** tiers: ≤5,000 → 100 · 5,001–60,000 → 500 · 60,001–500,000 → 1,000 · 500,001–1,000,000 → 1,500 · 1,000,001–5,000,000 → 2,000 (top tier applies above).
- **[INV] Reconciliation identity:** `Merchant float allocated = customer payouts + telecom charges + remaining float`.
- **[GATE]** A merchant may only claim a payout when float covers `amount + telecom charge`.
- The CFO permission matrix (`cashout_agents.config`) governs channels, payout categories, per-category approval rule (`none` / `finance` / `finance_cfo` / `cfo_only` / `operations_cfo` / `credit_committee`), limits and status (`active`/`suspended`/`blocked`/`under_review`/`on_leave`).
- Daily merchant report at 22:00 EAT from `generate_merchant_cashout_daily_report`, sourced straight from the ledger.

---

## 10. Landlords and Welile Homes

- **Welile Homes (agent-collection mode):** landlord is charged **10%** and receives **90%**. The agent's **2%** comes out of Welile's 10%, leaving Welile **8%**. The 10% is charged the moment rent lands (tenant wallet deposit or agent allocation).
- Enrollment books the receivable as **one month's rent × 12**, one due per month; landlord is paid on a fixed `payout_day` (1–28). Editing an enrollment recomputes only months with zero collection.
- New (profile-less) tenants require phone **OTP verification** before any due is scheduled.
- Landlord payouts require **OTP sent to the landlord's phone** before an agent may withdraw landlord float, plus a mandatory receipt upload for manual withdrawals.
- Unrecognised landlord phone numbers are auto-registered so links are never lost.

---

## 11. Deposits and inbound money

- Every approved deposit credits the **float bucket** by default (`approve-deposit` forces `isFloatDeposit`).
- Cash receipts use the **`RCT`** prefix; deposit references are validated and TID duplicates are detected and refused.
- Gmail auto-credit gates (all must pass): amount > 0, transaction id present, direction `in`, channel `mtn_momo`/`airtel_money`, receipt ≤ 7 days old, and a user resolved by (a) counterparty phone last-9 (confidence 1.0), (b) body-phone fallback that resolves to exactly one user (confidence 0.6), or (c) unique MTN name match. Ambiguity → skip, never guess.
- Deposit-driven debt recovery: 30% of a deposit is allocated to outstanding advances.
- Merchandise credit recovery: **15% of strict withdrawable per run, up to 4 runs/day**, idempotent per plan per hour-slot; recovered money credits company cash, not a personal wallet.

---

## 12. Approval authorities

| Decision | Authority |
|---|---|
| Rent request stages | Agent → Tenant Ops → Agent Ops → Landlord Ops → COO → CFO |
| Agent advance | Agent Ops (may skip CFO) → CFO disbursement |
| Business advance | Agent Ops → Tenant Ops → Landlord Ops → COO → CFO |
| Credit access draw | CFO / manager / super_admin only |
| Withdrawals | FinOps verification → merchant/bank settlement; CFO owns inbound and strategic capital |
| Director requisitions | CEO-role director; approve/reject terminal; comment ≥ 10 chars |
| Payroll | preparer → approver → releaser, separate `hr_pay_authorities`; release requires a dry run first |
| Portfolio top-ups | Partner Ops / COO; wallet + proxy agent only, instant deduction |
| Landlord/LC1 verification | Landlord Ops |

**[INV] Separation of powers:** CFO owns inbound capital, strategic movement and approvals; Financial Ops owns outbound payment and verification. Neither performs the other's step.

---

## 13. Rounding, timing and formatting rules

- Repayment and installment figures **round up** (`ceil`); fees and commissions **round to nearest** (`round`).
- All day boundaries for collections, eligibility and reports are **Africa/Kampala**.
- Key cadences: rent auto-charge 06:00 · advance deduction 18:00 EAT · advance sweep every 15 min · withdrawable drift scan every 15 min · merchandise recovery 4×/day · merchant report 22:00 EAT · CTO/wallet reports 00:00 EAT.
- Amounts are always formatted through `formatUGX`. No emojis in product copy. No underscores in user-facing labels.

---

## 14. Anti-fraud and integrity rules

- Names must contain at least two words and no random-character patterns (`validateFullName`) at registration and on profile completion.
- Duplicate LC1 chairperson phone numbers are blocked; duplicates are merged by Landlord Ops.
- Frozen agents get a full-screen legal block; frozen KYC accounts cannot transact.
- Drift monitoring: phantom drift every 15 min, withdrawable drift alerts at CFO-set thresholds (defaults 50K / 250K / 1M / 10M UGX for low/medium/high/critical). No automatic balance clamps — every correction is an explicit CFO action with a ≥10-character reason and an `audit_logs` row.
- SMS sender ID must be omitted so the registered default is used; forcing an unregistered sender causes silent carrier drops.

---

*Generated 2026-07-31 from live code, live Postgres catalog and project rule memory. When a rule changes, change the enforcing database object first, then this document, then the TypeScript mirror.*
