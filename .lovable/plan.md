## Diagnosis (verified against the live DB)

The "Daily Active Users" chart on `/cmo/dashboard?section=user-analytics` peaks at 0–4 because `UserAnalyticsView.tsx` and `UserAnalyticsDrilldown.tsx` query the wrong column on `otp_login_audit`:

- Code selects `user_id` from `otp_login_audit`, but that column does not exist. Actual columns are `resolved_user_id` / `actual_user_id`. supabase-js silently returns rows with `user_id === undefined`, so every day's `Set<string>` stays empty → chart flatlines near zero, and every drilldown scope that reads OTP audit returns no users.
- Even with the correct column, `otp_login_audit` only captured **95 successes / 62 distinct users** in the last 7 days — it logs OTP challenges, not general app activity. `login_phase_events` covers real sessions: **181,329 events / 650 distinct users** over the same window. That is the correct DAU source.
- Signups (`profiles.created_at`) and Role distribution (`user_roles`) queries are already correct — leave them alone.

## Changes

### 1. `src/components/executive/UserAnalyticsView.tsx`

- **Daily Active Users query**: switch from `otp_login_audit` to `login_phase_events`.
  - `select('created_at, user_id')`, filter `user_id IS NOT NULL`, group distinct `user_id` per day. No `outcome` filter — presence of a session event = active user.
  - Rename query key to `user-analytics-active-v2` so the stale broken cache is invalidated.
- **Totals block**: keep OTP-based `loginAttempts` / `loginSuccess` (they legitimately measure the OTP funnel and drive the "Login Success" KPI), but also add a `dau` count query against `login_phase_events` (`count exact, head:true`, distinct not needed for the KPI — sum `activeSeries` still drives "Active User-Days"). No behavior change to Total Users / New Signups.

### 2. `src/components/executive/UserAnalyticsDrilldown.tsx`

- Fix `fetchUserIds`:
  - Replace `otp_login_audit.select('user_id, outcome')` with `select('resolved_user_id, outcome')` and map from `resolved_user_id` (fallback to `actual_user_id` when null).
  - For the `dau` scope specifically, source from `login_phase_events.select('user_id')` (not OTP audit) to match the chart. Keep `login_success` / `login_failed` on `otp_login_audit` since those are OTP-funnel scopes.

### 3. No schema, RPC, or business-logic changes

Read-only fixes to two frontend files. Ledger, RLS, wallet code untouched.

## Verification after build

- Re-open `/cmo/dashboard?section=user-analytics`. Last-7d "Daily Active Users" chart should now show meaningful daily distinct users (order of ~100–200/day given 650 distinct in 7d), and "Active User-Days" KPI reflects the sum.
- Click the "Active User-Days" KPI → drilldown should list real users instead of an empty set.
- "Login Success" KPI and signup chart remain unchanged.
