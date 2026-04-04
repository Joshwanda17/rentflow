

# Fix: Sub-Agent Registration Awards UGX 500 Instead of UGX 10,000

## Root Cause

There are **two competing systems** awarding bonuses on user registration:

### Old system (active, broken)
1. **`credit_referral_bonus` trigger** on `profiles` table — fires on every new profile with a `referrer_id`. Awards a flat **UGX 500** "referral bonus" to the referrer by:
   - Inserting into `referrals` table with `bonus_amount = 500`
   - Inserting into `agent_earnings` with amount 500

2. **`credit_signup_referral_bonus` trigger** on `referrals` table — fires when `credited` becomes true. **Directly updates `wallets.balance`** (violating single-writer ledger rule) and inserts a `cash_in` ledger entry for 500.

### New system (correct, but competing)
3. **`credit_agent_event_bonus` RPC** called from `activate-supporter` edge function — awards **UGX 10,000** for `subagent_registration` via proper double-entry ledger entries.

The old triggers fire automatically on profile creation, awarding UGX 500 regardless of whether the new user is a sub-agent or a regular referral. The new RPC may also fire, but the agent sees the 500 first and the systems are redundant.

### Additional violation
`credit_signup_referral_bonus` runs `UPDATE wallets SET balance = balance + 500` directly — this bypasses the `sync_wallet_from_ledger` trigger, breaking the single-writer principle.

## Fix Plan

### 1. Replace both old triggers with ledger-compliant versions

**Migration** that:

- **Replaces `credit_referral_bonus`** (on `profiles`): Keep the referral record creation in the `referrals` table but remove the `agent_earnings` insert (legacy table) and remove the hardcoded 500 amount. Instead, set `bonus_amount` to differentiate:
  - Regular user referral: UGX 500
  - Sub-agent registration: UGX 0 (handled by the RPC in `activate-supporter`)

- **Replaces `credit_signup_referral_bonus`** (on `referrals`): Remove the direct `UPDATE wallets` statement. Instead, insert proper double-entry ledger records (`cash_out` platform marketing_expense + `cash_in` referral_bonus to wallet scope) with a deterministic `transaction_group_id` like `referral-bonus-{referral_id}`. The `sync_wallet_from_ledger` trigger will handle the wallet balance.

### 2. Keep `activate-supporter` sub-agent bonus as-is

The `credit_agent_event_bonus` RPC call in `activate-supporter` already correctly awards UGX 10,000 for `subagent_registration` via proper ledger entries. No changes needed there.

### 3. Add idempotency guard to prevent double-awarding

The rewritten `credit_signup_referral_bonus` trigger should check for existing ledger entries with the same `transaction_group_id` before inserting, preventing duplicates if the trigger fires multiple times.

## Files

- **1 new migration file** — replaces both trigger functions

## Expected Result

- Regular user referrals: agent gets UGX 500 via proper ledger flow
- Sub-agent registrations: agent gets UGX 10,000 via `credit_agent_event_bonus` RPC (no competing 500 bonus)
- No more direct wallet mutations — all balance changes flow through the ledger

```text
Before (broken):
  New sub-agent signs up
  → profiles trigger fires: 500 UGX referral bonus (old system)
  → referrals trigger fires: direct wallet UPDATE +500 (bypasses ledger)
  → activate-supporter calls RPC: 10,000 UGX (new system, may also fire)
  → Agent sees 500, confused

After (fixed):
  New sub-agent signs up
  → profiles trigger fires: creates referral record with bonus_amount = 0 (sub-agent handled elsewhere)
  → referrals trigger fires: skips because bonus_amount = 0
  → activate-supporter calls RPC: 10,000 UGX via proper ledger
  → Agent sees 10,000
```

