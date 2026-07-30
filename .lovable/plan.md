# /auth review: keep the page, trim the duplicate role choice

## What this page actually does

`/auth` is the platform's single entry point for getting into the app. Beyond the sign-in form it carries:

- Phone + one-time SMS code login, plus password and phone recovery flows
- Google and Apple sign-in, including handling the return trip from the provider
- Referral banners and recruitment-campaign attribution (the secure token that links a new user to the agent who recruited them)
- The "Sent by Agent X" deep-link banner
- The "Joining as ..." role badge and the inline "What do you need?" cards you selected

It is linked from roughly sixty places: the landing page, chat invites, short links, supporter activation, the dashboard redirect, and every "please sign in" prompt in the app. Deleting the page would lock every user out, so that is not on the table.

## The part that is genuinely redundant

Role choice exists in three places today:

| Surface | When it shows | What it does |
| --- | --- | --- |
| Inline cards on `/auth` (the block you selected) | Sign-up with no role in the link | Writes the chosen role into the URL, nothing else |
| `/welcome` (landing page) | Marketing entry, and the "Change" link on `/auth` | Sends the visitor to `/auth` with a role attached |
| `/select-role` (separate 431-line page) | After sign-in when the account has no role | Actually assigns the role to the account; also holds the manager access-code path |

The inline cards are the one surface with real value at signup: they stop a roleless account from being created, and they are the only fallback for anyone who reaches signup from a link that lost its role. `/select-role` is the safety net for accounts that end up with no role and is still wired into the dashboard redirect. `/welcome` is the marketing front door.

## Recommendation

Keep `/auth` and keep the inline cards. Do the cleanup on the duplication instead:

1. Align wording and the role list across the three surfaces so a visitor sees the same four choices with the same names everywhere (today `/auth` says "I want to earn" / "I want to earn and learn" while `/select-role` says "Supporter" / "Agent").
2. Extract the inline cards into a single shared role-picker component used by both `/auth` and `/select-role`, so the copy lives in one place.
3. Leave `/select-role` routed — it is the no-role recovery path and the manager access-code entry; removing it would strand accounts that lose their role.

No account data, roles, or attribution logic change.

## Technical notes

- Inline selector lives in `src/pages/Auth.tsx` (`ROLE_OPTIONS`, `needsRoleSelection`, `handleSelectRole`); it only sets the `role` search param.
- `/select-role` is reached from `src/pages/Dashboard.tsx`, `src/pages/DashboardRedirect.tsx`, and `src/hooks/useAuthForm.ts` when roles are empty.
- The shared picker would be a new presentational component; role assignment stays exactly where it is today.