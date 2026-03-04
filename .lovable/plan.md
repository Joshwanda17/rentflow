
Issue summary (confirmed from code + logs)
- Your app is already calling Google OAuth correctly via `lovable.auth.signInWithOAuth('google', ...)`.
- The persistent error (`provider 'google' is not supported`) is most likely from OAuth initiation/config mismatch, not from normal email/password auth.
- Two technical risks in current implementation can cause this exact loop on both domains:
  1) Redirect URI is hardcoded to `${window.location.origin}/auth` in `src/hooks/auth/authOperations.ts` (more fragile across preview/custom domains and URI whitelists).
  2) `public/sw.js` does not explicitly bypass `"/~oauth"` routes (only `/auth` and query `code/state`), which can break OAuth handoff in production PWA flows.

Best-solution implementation plan
1) Stabilize OAuth redirect strategy (single canonical approach)
- File: `src/hooks/auth/authOperations.ts`
- Change Google/Apple redirect target to a safer canonical origin strategy:
  - Use `getPublicOrigin()` helper (already exists) to avoid domain mismatch from preview.
  - Use root callback (`${origin}`) instead of forcing `/auth`, unless `/auth` is explicitly registered in provider URI settings.
- Add fallback retry logic:
  - If first OAuth call returns `provider not supported`, retry once with alternate redirect URI (root/custom origin).
- Add structured console diagnostics (domain, redirect_uri used, provider, error code/message) for fast future debugging.

2) Make service worker OAuth-safe
- File: `public/sw.js`
- Add explicit bypass for all OAuth bridge routes:
  - `url.pathname.startsWith('/~oauth')`
  - keep bypass for `/auth`, `code`, `state`, and backend auth host.
- Bump cache names (`welile-core-v2`, `welile-static-v2`) so old worker/caches cannot keep serving stale auth behavior.
- Ensure navigation requests for OAuth are always network-only.

3) Verify backend Google auth configuration consistency
- In backend auth settings:
  - Ensure Google sign-in is enabled.
  - Ensure redirect URIs include every active domain used by users (preview + published/custom) and whichever callback path we keep (`/` or `/auth`).
  - If using “your own credentials”, confirm all selected redirect URIs are also whitelisted in Google Cloud exactly.
- This step removes hidden “works for some domains/users but not all” drift.

4) Add UX guardrail in auth UI
- File: `src/hooks/useAuthForm.ts`
- When Google returns `provider not supported`, show actionable message:
  - “Sign-in configuration is syncing. Please retry in a few seconds.”
  - include a “Retry with alternate redirect” silent attempt before showing toast.
- Prevents hard failure loop and reduces support friction.

5) End-to-end verification checklist (must pass before closing)
- Test on preview domain and published/custom domain:
  - Click Google sign-in from `/auth`.
  - Confirm redirect starts and returns authenticated session.
  - Confirm no `provider not supported` toast.
- Test after hard refresh + new incognito session.
- Test once with existing Google user and once with new Google user.
- Confirm auth logs show successful OAuth initiation/login events for both domains.

Files to update
- `src/hooks/auth/authOperations.ts`
- `src/lib/getPublicOrigin.ts` (reuse; small adjustment only if needed)
- `src/hooks/useAuthForm.ts`
- `public/sw.js`

Expected outcome
- Google sign-in becomes reliable on both preview and published domains.
- No infinite “provider not supported” loop.
- OAuth remains resilient even with service worker enabled and cached builds.
