

## Investigation & Fix: General Authentication Failures

### Problem Analysis

From the auth logs and code review, I identified two compounding issues:

1. **Login loop generates excessive auth requests**: The `handleSignInSubmit` function in `useAuthForm.ts` tries up to 8+ email candidates per single login attempt (real emails from RPC, then 6 placeholder variants). Each failed attempt is a separate `signInWithPassword` call to the auth server. From the auth logs, I can see 6-8 `invalid_credentials` errors within the same second from the same IP — this is a single user's login attempt cycling through candidates.

2. **Phone-to-email resolution may return mismatched accounts**: The `get_email_by_phone` RPC matches by last 9 digits of phone. If multiple profiles share similar phone digits, or if the profile email differs from the actual auth email (e.g., profile updated after signup), the system tries the wrong email and fails even with the correct password.

3. **Rate limiting cascade**: Multiple users logging in from the same network (same IP `41.210.159.227` / `41.210.155.86`) each generate 6-8 auth requests. This can trigger auth rate limits, causing even correct credentials to fail.

### Plan

**Step 1: Create a diagnostic edge function**
- Query all users who have attempted login in the last hour
- Cross-check profile emails vs actual auth account emails
- Identify mismatches where `profiles.email` differs from `auth.users.email`
- Run this to understand the scope

**Step 2: Fix the login loop (reduce auth request storm)**
- Modify `handleSignInSubmit` in `useAuthForm.ts` to:
  - Try ONLY emails returned by the RPC/profile lookup first (max 2-3 attempts)
  - Only fall back to generated placeholder emails if NO profile was found at all
  - **Stop immediately** on the first `invalid_credentials` response if we already found the account via RPC (the password is wrong, not the email)
  - This reduces auth requests per login from ~8 to ~2

**Step 3: Create a bulk password verification & reset edge function**
- Accept a list of user IDs or "all affected users"
- Verify each user's password against `WelileManager` using admin API
- For any user whose password doesn't work with their known password, reset it
- Log results for audit

**Step 4: Improve error messaging**
- When the RPC finds the user's account but password fails, show a clearer message with the "Forgot password?" option more prominently
- Add a direct link to the SMS-based password reset flow in the error state

### Technical Details

**File changes:**
- `src/hooks/useAuthForm.ts` — Optimize login loop: stop after first RPC-matched email fails (lines 336-357)
- `supabase/functions/diagnose-auth/index.ts` — New edge function for investigation
- `supabase/functions/bulk-password-reset/index.ts` — New edge function for bulk reset

**Key code change in login loop:**
```typescript
// If RPC found real emails, ONLY try those — don't fall through to placeholders
if (rpcEmails.length > 0) {
  // Try real emails, then placeholder emails from RPC results
  for (const emailToTry of [...realEmails, ...placeholderEmails]) {
    const { error } = await signIn(emailToTry, password);
    if (!error) { loginSuccess = true; break; }
    lastError = error;
  }
  // Don't try generated placeholders — RPC already found the account
} else {
  // No RPC results — try generated placeholders (max 3)
  for (const emailToTry of uniqueCandidates.slice(0, 3)) { ... }
}
```

This reduces auth requests from ~8 per login to ~2, preventing rate limit cascades.

