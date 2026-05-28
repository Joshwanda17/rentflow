# Structured Solvency Bypass Reason Codes

The solvency guard `enforce_no_negative_wallet_ledger` today silently lets several "escape hatch" categories through (`admin_correction`, `system_balance_correction`, `platform_loss_writeoff`, float-category list, wallet_deduction adjustments). Operators can therefore push a wallet bucket negative with no machine-readable justification — only free-text in `description`/`audit_logs`. This plan formalizes the bypass and forces every escape to carry one of a short list of audit-grade reason codes.

---

## Scope

In:
- New enum + column on `general_ledger` for the reason code.
- Updated DB trigger that **requires** the code whenever a bypass path is hit and **rejects** the code on normal (non-bypass) legs.
- Edge functions that produce bypass legs accept + forward the code.
- CFO/FinOps UI surfaces a required dropdown the moment a bypass is detected.
- Audit log captures the code separately so reports can group by reason.

Out (separate work):
- Retroactive backfill of historical legacy bypass rows.
- Reason-code analytics dashboard (just leave the data clean for it).

---

## Reason codes (initial set)

| Code                          | When to use                                                             |
|-------------------------------|-------------------------------------------------------------------------|
| `legacy_offline_paid`         | Funds already moved off-platform; ledger catches up.                    |
| `write_off`                   | Uncollectible balance written off the platform.                         |
| `admin_correction_seed`       | One-time wallet seed/migration entry.                                   |
| `legacy_real_backfill`        | Backfill of a pre-platform real event.                                  |
| `dispute_resolution`          | Settlement of a customer/agent dispute.                                 |
| `regulatory_adjustment`       | Forced by BOU/CMA or external counterparty.                             |
| `duplicate_reversal`          | Rolling back a duplicate posting.                                       |
| `other_with_note`             | Catch-all — requires the operator's `reason` text to be ≥ 30 chars.     |

---

## Steps

### 1. Database migration

```sql
CREATE TYPE public.solvency_bypass_reason AS ENUM (
  'legacy_offline_paid','write_off','admin_correction_seed',
  'legacy_real_backfill','dispute_resolution','regulatory_adjustment',
  'duplicate_reversal','other_with_note'
);

ALTER TABLE public.general_ledger
  ADD COLUMN solvency_bypass_reason public.solvency_bypass_reason;

CREATE INDEX idx_gl_solvency_bypass_reason
  ON public.general_ledger (solvency_bypass_reason)
  WHERE solvency_bypass_reason IS NOT NULL;
```

Rewrite `enforce_no_negative_wallet_ledger` so that on every bypass branch it:
1. Raises `SOLVENCY_BYPASS_REASON_REQUIRED` if `NEW.solvency_bypass_reason IS NULL`.
2. For `other_with_note`, also requires `length(coalesce(NEW.description,'')) >= 30`.

On the **non-bypass** path (normal cash_out that passes the strict-balance check) it raises `SOLVENCY_BYPASS_REASON_NOT_ALLOWED` if the code is set — preventing operators from attaching a "legacy_offline_paid" tag to a regular debit just to look clean.

### 2. RPC + edge functions

- `create_ledger_transaction`: pass `solvency_bypass_reason` through from each entry untouched.
- `cfo-direct-credit`:
  - Accept optional `solvency_bypass_reason` in body.
  - For `operation:'debit'` OR when caller selects `classification:'admin_correction'` / wallet leg category in the bypass set, validate via Zod that the code is present and one of the enum values. Forward on both legs.
- `ops-bucket-transfer`: same — only relevant if direction would push a bucket negative, otherwise ignore.
- Other edge functions that intentionally post `admin_correction` / `system_balance_correction` / `platform_loss_writeoff` (search list below) get the same field plumbed through.

### 3. UI surfaces

- `CfoDirectCreditPanel` (and Debit twin): when the user picks an `admin_correction` classification, picks a bypass category, OR the live strict-balance check shows the debit would underflow, render a required `<Select>` with the eight reason codes plus a help tooltip. Submit button stays disabled until selected. `other_with_note` also enforces 30-char minimum on the existing reason textarea.
- `RouteEmailDepositDialog` debit flow: same dropdown when the destination user lacks funds and the operator chooses to proceed via an admin path.
- Audit logs: write the code into `audit_logs.metadata.solvency_bypass_reason` so the existing CFO audit explorer can filter on it.

### 4. Tests

- New SQL test: trigger raises `SOLVENCY_BYPASS_REASON_REQUIRED` for admin-correction cash_out without a code; succeeds with code; rejects bogus codes (enum guard).
- Integration test for `cfo-direct-credit` rejecting bypass debits with no code, and stamping the code onto both legs when supplied.

---

## Files to touch (technical)

- New migration `supabase/migrations/2026xxxx_solvency_bypass_reason.sql`
- `supabase/functions/cfo-direct-credit/index.ts`
- `supabase/functions/ops-bucket-transfer/index.ts`
- `supabase/functions/approve-deposit/index.ts` and other producers of `admin_correction` / `system_balance_correction` / `platform_loss_writeoff` (rg list during implementation)
- `src/components/cfo/CfoDirectCreditPanel.tsx` (+ debit panel)
- `src/components/financial-ops/RouteEmailDepositDialog.tsx`
- `src/lib/ledgerConstants.ts` — add `SOLVENCY_BYPASS_REASONS` const for client/edge reuse
- New mem note `mem://constraints/solvency-bypass-reason` documenting the rule

---

## Risk & rollout

- Hot path: every cash_out wallet leg flows through the trigger; change is small but must be deployed in lockstep with edge functions that already post bypass categories — otherwise live writes start failing. Mitigation: ship edge-function plumbing first with `solvency_bypass_reason` optional, then flip the trigger to required in a follow-up migration the same day, after backfilling any in-flight rows.
- No data loss: historical rows remain `NULL`; trigger only fires on INSERT.
- UI is purely additive — never blocks normal credits or in-bound deposits.

Please confirm the reason-code list (add/remove/rename any) and approve so I can ship the migration + edge function + UI changes.
