## Goal

Single edge function `validate-deposit-reference` that mirrors the `guard_deposit_reference_uniqueness` trigger so the UI can pre-flight a TID before submit and show the exact same outcome the DB would return — without a duplicate insert ever hitting the trigger.

## Endpoint

`POST /functions/v1/validate-deposit-reference`

Auth: required (`getClaims` on bearer token). Anyone authenticated can call it for their own pre-flight; admins use it from reconciliation tools.

### Request
```json
{
  "transaction_id": "string (required)",
  "exclude_deposit_id": "uuid (optional, for edit-mode pre-flight)"
}
```

### Response — 200 always (validation result, not HTTP error)
```json
{
  "valid": true | false,
  "reason": "ok" | "placeholder" | "duplicate_transaction_id" | "duplicate_in_notes",
  "message": "human-readable string identical in shape to the trigger's RAISE",
  "conflict": {                       // only when valid:false and not placeholder
    "deposit_id": "uuid",
    "status": "pending|approved|...",
    "matched_field": "transaction_id" | "notes"
  } | null
}
```

400 only for malformed body. 401 for missing/invalid JWT. 500 for unexpected DB error.

## Validation logic (1:1 with the trigger)

1. Trim + null-coerce `transaction_id`. If empty → `valid:true, reason:"placeholder"`.
2. Uppercase compare against placeholder set: `NONE, N/A, NA, PENDING, TBD, UNKNOWN` → `valid:true, reason:"placeholder"`.
3. Query `deposit_requests` for `UPPER(TRIM(transaction_id)) = UPPER(:ref)`, excluding `exclude_deposit_id`. Match → `valid:false, reason:"duplicate_transaction_id"` with conflict row + trigger-style message.
4. Query `deposit_requests` for `POSITION(LOWER(:ref) IN LOWER(notes)) > 0`, same exclusion. Match → `valid:false, reason:"duplicate_in_notes"`.
5. Otherwise `valid:true, reason:"ok"`.

Implementation: two `select … limit 1` calls via the service-role client (RLS would otherwise hide other users' deposits — the trigger uses SECURITY DEFINER, so the function must too). No writes. No new tables/columns/RPCs.

## Frontend integration (no behavior change, just one wiring point)

- `src/lib/invokeEdgeFunction` already exists — use it.
- Replace the inline debounced duplicate-check in `DepositFlow.tsx` (and the float-payout `transaction_id` check in `FloatPayoutVerification.tsx`) with a single helper `validateDepositReference(tid, excludeId?)` in `src/lib/depositReferenceValidator.ts`.
- Helper is called:
  - On debounced (400ms) change of the TID input → disables Submit + shows inline error.
  - On Submit click as a final guard (defense in depth) before invoking `agent-deposit` / `approve-deposit`.
- The DB trigger remains the source of truth; `23505` error handling in `PaymentConfirmationForm.tsx` stays unchanged as the last-line defense.

## Files

New:
- `supabase/functions/validate-deposit-reference/index.ts`
- `src/lib/depositReferenceValidator.ts`
- `supabase/config.toml` block: `[functions.validate-deposit-reference] verify_jwt = false` (in-code JWT validation, matching project convention).

Modified:
- `src/components/payments/DepositFlow.tsx` — swap inline lookup for helper.
- `src/components/agent/FloatPayoutVerification.tsx` — same swap.

## Out of scope

- No DB schema changes (no tables, no columns, no indexes, no RPCs).
- No change to the trigger itself.
- No changes to `agent-deposit` / `approve-deposit` write path.
- No retroactive scan of historical duplicates.
