---
name: Recovery counter must not reset on reload
description: clearAndReload must never call clearRecoveryAttempts; only the 45s stable-mount timer may reset the iOS chunk-recovery counter
type: constraint
---
`clearAndReload()` (src/lib/hardRecovery.ts) must NOT reset the recovery-attempt
counter (`clearRecoveryAttempts`). Doing so caused an infinite iOS loop: an
iPhone serving a 404-ing route chunk cycled hard_recover 1→2→3 → manual_reload
(which reset the counter) → 1→2→3 forever, so MAX_RECOVERY_ATTEMPTS (3) never
tripped and the terminal "Update Required" / manual-clear UI never showed
(symptom: stuck on "Clearing old iPhone cache…" splash at welilereceipts.com/?_v=…).

**Why:** the exhaustion cap is the only thing that breaks the loop into an
actionable terminal screen. The ONLY legitimate place to clear the counter is the
`setTimeout(clearRecoveryAttempts, 45_000)` in main.tsx after a successful, stable
mount — proof the app actually recovered.

Diagnosed via `update_failure_events` telemetry (event_type, reload_attempts).
The underlying trigger is a route JS chunk returning 404 on the device/edge cache;
client cache-busting can't fix a missing server chunk — user must clear Safari
website data for the domain (or use a private tab / another browser).
