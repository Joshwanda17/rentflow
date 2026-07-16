# Tiered KYC + Fraud Prevention

Goal: gate new-signup abuse with a Level 1 default (UGX 20,000/day, 1 withdrawal/day, no merchant/agent), progress users to higher levels through a **hybrid** of the existing Welile Trust Score (progression eligibility) and a new **fraud risk score** (real-time abuse signals), and give admins a console to review and act. Level 2 (NIN + selfie + manual approval) is designed in but not turned on.

## 1. Data model (migrations)

New tables (all with GRANTs + RLS + audit):

- `kyc_profiles` — one row per user
  - `kyc_level` smallint (1..3, default 1)
  - `level_source` text (`default` | `grandfathered` | `upgraded` | `manual` | `downgraded`)
  - `frozen` bool, `frozen_reason` text
  - `daily_withdrawal_cap_ugx` bigint (nullable = use level default)
  - `daily_withdrawal_count_cap` int (nullable)
  - `upgraded_at`, `last_reviewed_at`, `last_reviewed_by`
- `kyc_level_config` — level → default caps, permissions (can_register_merchant, can_be_agent, max_transfer, etc.). Configurable without code.
- `kyc_risk_scores` — per-user rolling **fraud** risk score (0–100), factor breakdown JSONB, `last_computed_at`, `tier` (`low` | `elevated` | `high` | `critical`).
- `kyc_risk_events` — append-only signal log: `event_type` (`otp_excess`, `pin_fail_burst`, `rapid_withdraw`, `device_multi_account`, `velocity_burst`, `suspicious_pattern`, `login_anomaly`), `severity`, `metadata`, `occurred_at`.
- `kyc_flags` — open cases for admin review: `reason`, `status` (`open` | `reviewing` | `resolved` | `dismissed`), `resolution`, `resolved_by`.
- `kyc_level_change_audit` — every level up/down/freeze/unfreeze with actor + reason (10-char min, matches existing audit rules).
- `kyc_device_links` — materialized view or table joining `user_device_sessions.device_hash` → set of user_ids, refreshed by trigger, used for "N accounts on this device" checks.

All tables: `GRANT`s per fortress rules, RLS (`authenticated` sees own row; `has_role(auth.uid(),'super_admin'|'manager'|'cfo'|'operations')` sees all), audit triggers.

## 2. Level 1 enforcement (Both: DB trigger + edge fn)

- **Fortress trigger** `trg_enforce_kyc_withdrawal_cap` on `withdrawal_requests` BEFORE INSERT:
  - Look up `kyc_profiles.kyc_level` + effective cap from `kyc_level_config`.
  - Reject if today's approved+pending withdrawals for user would exceed daily UGX cap or count cap.
  - Reject with clear ERRCODE + hint if `frozen = true`.
- **Edge fn** `approve-withdrawal` and `WithdrawFlow` client hook `useKycLimits` — same check up-front for friendly UX ("Level 1 limit: UGX 20,000/day. Verify to unlock higher limits.").
- Merchant/agent registration flows (`RegisterTenantDialog`, agent onboarding, `merchant_agreement_acceptance` insert path) reject Level 1 users with a "requires Level 2" message.
- High-value transfers (`money_requests`, wallet transfer edge fns) get the same guard.

## 3. Hybrid scoring

**Progression score** = existing `welile_trust_score_cache` (unchanged, single source of truth for trust mission).

**Fraud risk score** = new, computed by RPC `recompute_kyc_risk_score(p_user_id)`:

- Weighted sum over last 30 days of `kyc_risk_events` by severity, plus:
  - +weight if user shares device with N≥2 other users (`kyc_device_links`)
  - +weight for withdrawals within X min of signup
  - +weight for >K OTP requests / hour, >M PIN fails / hour
  - +weight for velocity bursts (N withdrawals in <T minutes)
- Tier thresholds → `low/elevated/high/critical`.
- `high`/`critical` auto-inserts a `kyc_flags` row and sets `kyc_profiles.frozen = true` (withdrawals blocked; wallet reads unaffected).

Cron `recompute-kyc-risk-scores` every 15 min for elevated users, on-demand recompute on every OTP/withdrawal/login event via edge fn hook.

## 4. Progression (Level 1 → 2 eligibility)

RPC `evaluate_kyc_upgrade_eligibility(p_user_id)` returns `{eligible, missing:[…]}`:

- Trust score ≥ threshold (config)
- Fraud risk tier ≤ `low`
- Zero open `kyc_flags`
- No `fraud_identity_blocks` match
- Account age ≥ threshold, ≥N successful transactions

Eligibility only unlocks the *UI path* to submit NIN + selfie later. Actual Level 2 grant happens only via `admin_grant_kyc_level` RPC (manual approval), and the manual-approval UI is scaffolded but hidden behind feature flag `enableKycLevel2`.

## 5. Fraud detection hooks

Instrumentation points (all emit `kyc_risk_events` + `system_events`):

- `otp_verifications` insert trigger → OTP-burst detection
- `otp_login_audit` → failed PIN detection
- `withdrawal_requests` insert trigger → rapid-after-signup + velocity
- `user_device_sessions` insert trigger → refresh `kyc_device_links`, flag if device now links ≥3 users
- Signup path (`handle_new_user`) already checks `fraud_identity_blocks`; extend to also seed `kyc_profiles` row.

## 6. Grandfather rule (existing users)

Backfill migration:

- Users with ≥5 approved withdrawals AND zero fraud flags AND no `fraud_identity_blocks` hit → `kyc_level = 2`, `level_source = 'grandfathered'`, `upgraded_at = now()`.
- Everyone else → `kyc_level = 1`.
- Audit row per grandfathered user.

## 7. Admin console

New page `src/pages/admin/KycConsole.tsx` (roles: `super_admin`, `manager`, `cfo`, `operations`):

- List / search users with columns: level, risk tier, risk score, open flags, frozen state, last event.
- Filters: level, tier, frozen, has-open-flag.
- Row drawer: user summary, trust vs risk breakdown, recent `kyc_risk_events`, device-linked accounts, action buttons — **Upgrade level**, **Downgrade level**, **Freeze**, **Unfreeze**, **Resolve/dismiss flag**, **Set custom cap**. All actions call RPCs, require reason (≥10 chars), write `kyc_level_change_audit` + `audit_logs`.
- Live count badges (open flags, critical tier) using existing dashboard patterns.

## 8. User-facing UX

- `KycStatusCard` on wallet + profile: shows current level, remaining daily cap, and CTA "Verify your identity to raise limits" (disabled if Level 2 not enabled yet).
- Withdrawal flow: pre-flight `useKycLimits` shows remaining allowance and disables submit past cap with the friendly explanation.
- Merchant/agent join CTAs display Level-2-required banner instead of failing at submit.

## 9. Level 2 readiness (scaffold only, feature-flagged)

- Add `nin_verification` + `selfie_verification` columns to `kyc_profiles` (nullable).
- Add `KycVerificationSubmit` component behind `enableKycLevel2` flag in `FeatureFlagsContext` (currently OFF).
- `admin_grant_kyc_level` RPC handles the manual approval path when the flag is on.
- No third-party provider wired now; adapter interface documented so a NIRA/Smile-ID integration slots in later.

## 10. Rollout

1. Migration: tables, config seed (Level 1 = 50 000 UGX / 1 tx per day; Level 2 = e.g. 500 000 UGX / 10 tx; Level 3 = uncapped), RLS, GRANTs, triggers, RPCs.
2. Grandfather backfill.
3. Fraud event hooks + risk recompute cron.
4. Edge fn + client cap enforcement + KycStatusCard.
5. Admin console.
6. Ship with `enableKycLevel2 = false`; enable later once verification vendor picked.

## Technical notes

- Fits fortress rules: no direct wallet writes; caps enforced at DB layer; `kyc_profiles.frozen` only blocks *new* withdrawal inserts, never mutates wallets.
- All new tables follow the CREATE → GRANT → RLS → POLICY order.
- Uses `has_role()` security-definer pattern for admin RLS (no recursion).
- Reuses `user_device_sessions.device_hash` (no new fingerprint library, no new dependency).
- Every score change and level change emits `system_events` (trust mission compliance).
- SMS notifications on freeze/unfreeze go through Yoola default sender (no `WELILE` sender override).
- All UGX shown via `formatUGX` helper.