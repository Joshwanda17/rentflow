# CTO Temporary-Password Reset + Forced Reset-on-Login

## Goal
Give the CTO a dashboard tab to look up a user by **phone or email**, issue a **temporary password**, and deliver it (SMS + on-screen link the CTO can share). When that user next opens their dashboard, they are **forced** to set a new password before they can do anything else.

## What already exists (reused)
- `profiles.must_change_password` boolean column already exists but is currently unused — this becomes the "force reset" flag.
- `admin-reset-password` edge function pattern (role gate + `admin.updateUserById`) — mirrored for the new function.
- `ForcePasswordChange.tsx` portal pattern — reused as the visual model for the blocking gate.
- CTO sidebar config in `executiveSidebarConfig.ts` and tab routing in `CTODashboard.tsx`.

## Changes

### 1. Backend (migration)
- No new table. Add a partial index on `profiles(must_change_password) where must_change_password = true` for fast gate checks. Confirm `must_change_password` defaults to `false`.

### 2. Edge function: `cto-issue-temp-password`
- Verify caller JWT and require an authorised role (`cto`, `manager`, `super_admin`).
- Input: `{ identifier }` (phone OR email). Normalise phone via Uganda phone rules; resolve the target `user_id` + auth email from `profiles`. Clear, specific errors when not found / ambiguous.
- Generate a human-readable temp password (e.g. `Welile-7F3K`).
- `admin.updateUserById(user_id, { password: temp })`, then set `profiles.must_change_password = true`.
- Deliver: send an SMS (when a phone exists) containing the temp password + login link `https://welilereceipts.com`; always return `{ temp_password, login_url, delivered_via, masked_target }` so the CTO sees it on screen and can share the link/password manually.
- Write an `audit_logs` row (`action_type: 'cto_temp_password_issued'`, reason ≥ 10 chars).

### 3. CTO dashboard tab: "Reset Password"
- Add sidebar item `{ label: 'Reset Password', id: 'password-reset' }` to the `cto` section in `executiveSidebarConfig.ts`.
- New component `src/components/cto/CTOPasswordResetPanel.tsx`: input for phone/email, "Issue temporary password" button, and a result card showing the generated temp password (copy button), the shareable login link, and delivery status.
- Branch in `CTODashboard.tsx`: `if (activeTab === 'password-reset') return <CTOPasswordResetPanel />;`.

### 4. Forced reset-on-login gate (must-do)
- New page `src/pages/ForceResetPassword.tsx` + route `/force-reset-password`: password + confirm fields with strength rules; calls `supabase.auth.updateUser({ password })`, then sets `profiles.must_change_password = false`, then routes to the user's dashboard.
- New global gate `src/components/auth/ForceResetPasswordGate.tsx`: for any logged-in user, reads `profiles.must_change_password`; while `true` it renders a **full-screen blocking portal** (same pattern as `ForcePasswordChange`) that forces the reset and cannot be dismissed. Mounted alongside the other authenticated gates in `App.tsx` so it intercepts every route immediately after login.

## Technical notes
- Temp password respects the platform's leaked-password (HIBP) protection; the generator avoids common/breached patterns by including random entropy.
- The gate uses a fresh DB read of `must_change_password` (not React Query cache) per the high-stakes-mutation rule.
- All amounts/text follow existing UGX + terminology conventions (none financial here).
- SMS uses the existing SMS-sending infrastructure already used by `password-reset-sms`.

## Out of scope
- No changes to normal login, OTP, or PIN flows beyond the new gate check.
