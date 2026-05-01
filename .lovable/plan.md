## Goal

Make it structurally impossible for any deposit writer in the app to send an empty string `""` as `deposit_purpose` to Postgres — which is what triggers the cryptic `invalid input value for enum deposit_purpose: ""` error and the resulting "dead Confirm button" experience.

Default fallback: **`'other'`** (a valid enum value), not `null`. Two reasons:
- The DB column is `NOT NULL` in practice for new rows (every recent insert carries a value), and `'other'` is already in the enum and already understood by `approve-deposit` and Financial Ops review screens.
- Funder/Supporter callers that today pass `'personal_deposit'`, `'partnership_deposit'`, etc. are unaffected — the guard only triggers when the value is missing/empty/invalid.

## Where empty strings can leak in today

1. **`src/components/payments/DepositFlow.tsx`** — already has an `ALLOWED_DEPOSIT_PURPOSES` allowlist + `purposeOverrideRef` belt-and-braces, but in `handleSubmit` (around lines 766–778) the recovery path still aborts the submit when nothing matches. Per request, instead of aborting we'll **coerce to `'other'`** as the final fallback so the agent's tap is never lost.
2. **`src/components/payments/PaymentConfirmationForm.tsx`** (line 124) — already passes a real value, but uses an inline ternary; we'll route it through the shared sanitiser.
3. **`src/components/agent/AgentDepositDialog.tsx`** (line 154) — currently OMITS `deposit_purpose` entirely. We'll explicitly pass `'other'` via the sanitiser so the column is never relying on a DB default.

## Changes

### 1. New shared helper — `src/lib/depositPurposeGuard.ts`
```ts
export const ALLOWED_DEPOSIT_PURPOSES = [
  'operational_float',
  'personal_deposit',
  'partnership_deposit',
  'personal_rent_repayment',
  'other',
] as const;
export type DepositPurpose = typeof ALLOWED_DEPOSIT_PURPOSES[number];

/**
 * Final client-side guard before any insert/update touches `deposit_requests`.
 * Returns a guaranteed-valid enum value. Empty strings, null, undefined,
 * whitespace, or stale/legacy values are coerced to 'other' so Postgres
 * NEVER receives `''` (which raises `invalid input value for enum
 * deposit_purpose: ""` and leaves the user with a dead Confirm button).
 */
export function safeDepositPurpose(raw: unknown): DepositPurpose {
  if (typeof raw !== 'string') return 'other';
  const trimmed = raw.trim();
  if (!trimmed) return 'other';
  return (ALLOWED_DEPOSIT_PURPOSES as readonly string[]).includes(trimmed)
    ? (trimmed as DepositPurpose)
    : 'other';
}
```

### 2. `DepositFlow.tsx`
- Replace the local `ALLOWED_DEPOSIT_PURPOSES` const + `DepositPurpose` type with imports from the new helper (single source of truth).
- In `handleSubmit`, replace the abort-on-invalid block (lines 771–777) with:
  ```ts
  const safePurpose = safeDepositPurpose(effectivePurpose);
  ```
  so a missing purpose silently falls back to `'other'` instead of aborting. Keep the friendly toast mapping for any DB-returned enum error (defence in depth).
- Apply `safeDepositPurpose(...)` to the three places that set `deposit_purpose` on the insert/update payloads (lines 838, 858, 889).

### 3. `PaymentConfirmationForm.tsx`
Wrap the ternary on line 124:
```ts
deposit_purpose: safeDepositPurpose(
  dashboardType === 'supporter' ? 'partnership_deposit' : 'other'
),
```

### 4. `AgentDepositDialog.tsx`
Add an explicit field to the insert (line 154 area):
```ts
deposit_purpose: safeDepositPurpose(null), // → 'other'
```
so the row carries a known-valid enum value and is never reliant on a Postgres column default.

### 5. Build guard — `scripts/guard-deposit-purpose.mjs`
Tiny CI script that fails the build if anyone in the future writes `deposit_purpose:` directly to a `deposit_requests` insert/update payload without going through `safeDepositPurpose(...)`. Wire it into `package.json`'s existing `prebuild`/check script chain alongside the other guards (`guard-frontend-ledger-writes.mjs`, `guard-persona-routes.mjs`).

## Out of scope

- Changing the Postgres enum (no DB migration needed — `'other'` already exists).
- Touching the wallet routing / approval pipeline — `'other'` is already handled by `approve-deposit`.
- The Funder dashboard purpose-label question (separate concern; not part of this guard).

## Verification after build

1. Manually open `DepositFlow` from any dashboard, fill amount + reference, and tap Confirm even if the purpose grid is somehow blank — confirm the row inserts with `deposit_purpose='other'` instead of erroring.
2. Run the new CI guard script; confirm it passes on the current tree and fails when given a fixture insert that bypasses `safeDepositPurpose`.
3. Verify in Financial Ops review that `'other'` rows are surfaced under their existing "Other / Misc" lane.
