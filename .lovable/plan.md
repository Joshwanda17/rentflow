

The user wants a production-ready "Install App" card. The project already has `usePWAInstall` hook + `PWAInstallPrompt` floating banner. I'll add a proper **dashboard card** variant (non-intrusive, dismissible per session) that satisfies all the spec points and reuses the existing hook (no duplicate `beforeinstallprompt` listeners — important to avoid the prompt being captured twice).

## Plan: Dashboard "Install App" Card

### Approach
Reuse the existing `usePWAInstall` hook (it already handles `beforeinstallprompt` capture, iOS detection, `appinstalled`, and standalone detection). Build a new presentational card component on top of it.

### What I'll build

**1. New component: `src/components/InstallAppCard.tsx`**
- Clean card UI matching the project's design tokens (uses `bg-card`, `border-border`, existing Button)
- Title: "Install App"
- Benefit copy: "Faster access, offline-ready, and a native app feel right from your home screen."
- Primary action: **Install App** button → calls `promptInstall()` from the hook
- Dismiss: small `X` icon top-right
- iOS variant: swaps button for a Share-icon hint ("Tap Share → Add to Home Screen")

**2. Display logic (all spec points covered)**
| Condition | Behavior |
|---|---|
| App already installed (standalone) | Card hidden |
| Browser doesn't support install + not iOS | Card hidden |
| User dismissed this session | Card hidden (sessionStorage key `welile_install_card_dismissed`) |
| `beforeinstallprompt` not yet fired | Card hidden until it does (subscribes via hook) |
| After successful install (`appinstalled`) | Card auto-hides |

**3. Session-only dismissal**
- `sessionStorage.setItem('welile_install_card_dismissed', '1')` on close — clears when tab closes (per spec: "do not show again for the session")
- No localStorage so next session re-evaluates

**4. Install click handler**
- Calls `promptInstall()` (hook already calls `.prompt()` + handles `userChoice`)
- On `accepted` → toast success, card hides via `isInstalled` flip
- On `dismissed` → card stays (user might click again) but we don't auto-prompt
- iOS → toast hint, dismiss card

**5. Mounting location**
- Mount inside the main dashboard layout once, near the top of the content area (non-intrusive — appears as a card in the normal flow, not a floating banner)
- Recommended placement: top of `src/pages/Dashboard.tsx` or equivalent main authenticated landing page (will confirm the exact file by reading the dashboard entry during implementation)

**6. Edge cases handled**
- No `beforeinstallprompt` support (Firefox desktop, etc.) AND not iOS → `canShow` is false → card never renders, no errors
- Hook already guards `globalDeferredPrompt` null case
- `appinstalled` event clears state via existing hook listener

### What I will NOT do
- Won't add a second `beforeinstallprompt` listener (would conflict with the global one in `usePWAInstall.tsx`)
- Won't touch `PWAInstallPrompt.tsx` (the floating bottom banner) — both can coexist; the card is for the dashboard surface, the banner is a global fallback. If you'd rather have only one, say so and I'll remove the floating banner.
- Won't add service workers / `vite-plugin-pwa` — project already has a manifest and the install flow works without SW changes

### Files
**New**
- `src/components/InstallAppCard.tsx`

**Modified (one line — mount the card)**
- The main dashboard page (will identify the exact file: likely `src/pages/Dashboard.tsx` or the role-based dashboard wrapper)

### Expected outcome
Users land on the dashboard → if their browser supports install AND the app isn't installed AND they haven't dismissed it this session → a tasteful card appears in-flow with "Install App" button → click triggers the **real** browser install prompt → on accept the card disappears and a success toast fires. Dismissing hides it for the rest of the session. iOS users see a Share-icon hint instead. Unsupported browsers see nothing.

