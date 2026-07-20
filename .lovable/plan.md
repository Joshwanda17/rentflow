## Goal

Every invitee who signs up through an inviter's referral link earns the **inviter UGX 500** (invitee gets nothing on signup). Keep the existing **+UGX 200 first-transaction** bonus for the inviter.

## Changes

### 1. DB migration — update `credit_referral_bonus` trigger
`supabase/migrations/20260129055851_...sql` currently credits UGX 500 to **both** the referrer and the new user. Ship a new migration that replaces the function so it:
- Still inserts the `referrals` row with `bonus_amount = 500`, `credited = true`.
- Credits **only the referrer's** wallet (`wallets.balance + 500`).
- Removes the invitee wallet UPDATE and the "🎁 Welcome Bonus!" notification to the new user.
- Keeps: agent_earnings row, referrer notification, push notification.
- Leaves the first-transaction (+200) crediting path untouched (that lives elsewhere and continues to fire when the invitee completes their first qualifying transaction).

### 2. UI — `src/pages/Referrals.tsx`
Fix the stale hardcoded copy so it matches the real reward structure:
- Replace the "UGX 100 / UGX 200 / UGX 300" tri-panel with "**UGX 500** on signup + **UGX 200** on 1st transaction = **UGX 700** total per friend".
- Keep `totalEarned`, `pendingFirstTxBonus` math (already reads `bonus_amount` from DB, so it auto-reflects 500).

### 3. Sweep for other stale copy
Grep for "UGX 100" / "100 UGX" / "referral bonus" in `src/components/shared/InviteAndEarnCard.tsx`, `ReferralStatsCard.tsx`, `ReferralBanner.tsx`, `MyReferralsCount.tsx`, and any onboarding surfaces; update wording only where it advertises the signup amount. No logic changes there.

## Out of scope
- First-transaction bonus amount and trigger (unchanged).
- Referral link format, short-link generation, phone-verification gating.
- Historical `referrals` rows (already stored with their own `bonus_amount`; not backfilled).
