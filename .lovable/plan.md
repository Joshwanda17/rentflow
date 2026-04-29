## Goal

Make this formula the **single source of truth** everywhere a rent request is created or edited:

```text
Total Repayment = (Rent × 1.33ⁿ) + Registration Fee   where n = days/30
Registration Fee = 10,000 if Rent ≤ 200,000 else 20,000
Daily Payment    = ceil(Total Repayment / Days)
```

Today the formula lives correctly in `src/lib/rentCalculations.ts` and is used by the UI, but **the server trusts client-supplied numbers**. A bad client (or my recent simulation script) can persist mismatched values like 110,000 instead of 143,000. We will close that gap.

---

## What we'll change

### 1. Frontend — formula stays, add a guard

- Keep `src/lib/rentCalculations.ts` as the canonical TS implementation (unchanged math).
- Add `src/lib/__tests__/rentCalculations.test.ts` asserting the full 8-row reference table from your spec. Locks against silent regressions.
- Audit the 3 known UI call sites (`CreditRequestSheet`, `RegisterTenantPublic`, `PublicRentCalculator`) to confirm none hand-roll the math; convert any stragglers to `calculateRentRepayment()`.

### 2. Database — authoritative formula + hard guard

New migration adds:

- **`compute_rent_repayment(rent numeric, days int)`** — `IMMUTABLE` SQL function returning `(access_fee, request_fee, total_repayment, daily_repayment)`. Mirrors the TS formula exactly (`rent * pow(1.33, days/30.0) - rent` rounded, fee 10k/20k, ceil for daily).
- **`enforce_rent_request_formula()`** trigger BEFORE INSERT OR UPDATE on `rent_requests`:
  - Recomputes the canonical values from `rent_amount` + `duration_days`.
  - **Overwrites** `access_fee`, `request_fee`, `total_repayment`, `daily_repayment` with the canonical values (small Δ tolerance of 1 UGX for legacy rows on UPDATE only).
  - On INSERT, raises an exception if client sent values that diverge by >1 UGX (so we surface bugs instead of silently fixing).
- Backfill audit query (read-only, written into a `rent_request_formula_drift` view) listing existing rows whose stored numbers don't match the formula. CFO can review before we run a one-shot correction.

### 3. Edge functions — stop trusting client numbers

- `supabase/functions/submit-tenant-form/index.ts`: drop the client `access_fee` / `request_fee` / `total_repayment` inputs and call `compute_rent_repayment` (or recompute inline) before insert.
- `supabase/functions/approve-rent-request/index.ts`: re-derive from `rent_amount + duration_days` before any disbursement decision.
- `validate-payload/index.ts`: change `derived: true` from a label into actual behavior — strip those fields from incoming payloads for `rent_requests`.

### 4. Memory

Add `mem://business-model/rent-formula` capturing:
- The formula and reference table
- "DB trigger `enforce_rent_request_formula` is the source of truth; client values are ignored"
- The 8-row test as the regression contract

---

## Out of scope

- Commission rate changes. Commission stays at 10% of `total_repayment` (so for 100K/30d = 14,300, not 11,000). The earlier "11,000" in my simulation summary was my arithmetic error, not a code bug.
- Editing existing historical rent requests. The drift view is reported; correction is a separate approved action.

---

## Verification after build

1. Run vitest — new reference-table test must pass.
2. Insert a rent request via `psql` with deliberately wrong `total_repayment` → trigger raises.
3. Insert via `submit-tenant-form` with no fee fields → row stored with canonical 143,000 for 100K/30d.
4. Query `rent_request_formula_drift` and report row count to you before any backfill.

Approve and I'll implement.