

# Phase 1 — Harden Without Breaking (3 Migrations)

## Current State Confirmed
- `create_ledger_transaction`: Has balance check + direction validation, but **zero category validation**
- `sync_wallet_from_ledger`: Only skips `rent_float_funding` and `landlord_float_payout` — **all other platform/bridge entries incorrectly modify wallets** (the #1 corruption source)
- `treasury_controls` table exists with `control_key`/`enabled` columns; no `strict_mode` row yet

---

## Migration 1 — Fix `sync_wallet_from_ledger` (HIGHEST PRIORITY)

Add scope guard at the top of the trigger function:

```sql
IF NEW.ledger_scope != 'wallet' THEN
  RETURN NEW;
END IF;
```

This replaces the category-based exclusion list. Platform and bridge entries will no longer touch wallets. The existing `rent_float_funding`/`landlord_float_payout` skip becomes redundant but is kept for safety.

## Migration 2 — Harden `create_ledger_transaction` (Soft Enforcement)

Add to the existing function (after balance/direction checks):

**A. Category allowlist** — 22 locked categories. If category is not in the list → `RAISE NOTICE` (log warning, don't block). This preserves legacy edge function compatibility.

**B. Amount guard** — `amount > 0` or raise exception.

**C. ROI flow rule** — If any entry uses `roi_expense`, the group MUST also contain `roi_wallet_credit` or `roi_reinvestment`. Hard enforce this one (RAISE EXCEPTION) since ROI without coverage is the most dangerous flow.

**D. ROI liquidity guard** — Before ROI entries, check platform cash. If insufficient → `RAISE NOTICE` (soft fail for now, respecting the user's instruction).

## Migration 3 — Safety Trigger + `strict_mode` Flag

**A.** Insert `strict_mode` row into `treasury_controls` (default `false`).

**B.** Create `validate_ledger_category()` BEFORE INSERT trigger on `general_ledger`:
- Checks if `create_ledger_transaction` set a bypass flag (via `SET LOCAL`)
- If not bypassed, validates category against allowlist
- If `strict_mode = true` → RAISE EXCEPTION
- If `strict_mode = false` → RAISE NOTICE (log only)

---

## What This Does NOT Do (Intentionally)
- Does not block legacy categories (soft mode)
- Does not enforce full category-scope mapping (Phase 2)
- Does not rewrite edge functions (Phase 2)
- Does not enable strict mode (Phase 3, after edge function migration)

## Files Changed

| Asset | Change |
|-------|--------|
| Migration 1 | `CREATE OR REPLACE FUNCTION sync_wallet_from_ledger()` — add `ledger_scope != 'wallet'` guard |
| Migration 2 | `CREATE OR REPLACE FUNCTION create_ledger_transaction()` — add category notice, amount check, ROI flow+liquidity rules |
| Migration 3 | Insert `strict_mode` into `treasury_controls` + create `validate_ledger_category()` trigger |
| `src/lib/ledgerConstants.ts` | Add `LOCKED_CATEGORIES` array for client-side reference |

## Risk Assessment
- **Migration 1**: Zero risk of breakage — it only *stops* incorrect wallet mutations
- **Migration 2**: Zero breakage — soft notices only, hard enforce only for ROI flow rule
- **Migration 3**: Zero breakage — soft mode by default, strict mode is opt-in via `treasury_controls`

