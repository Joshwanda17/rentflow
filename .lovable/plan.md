## Goal

Treat every `general_ledger` entry dated **2026-04-01 or later** as **production money** so reconciliation, dashboards, and the wallet-truth view stop excluding it as legacy/test data. Anything before April stays as-is (history is preserved).

## Current state (live DB)

April 1 → today, by classification:

| Classification | Legs | Action |
|---|---|---|
| `production` | 3,870 | leave |
| `legacy_real` | 296 | **promote → `production`** |
| `test_dev` | 10 | **promote → `production`** |
| `admin_correction` | 79 | **leave** (these are reconciliation pairs — must stay tagged so CFO can audit them separately) |

Default for new inserts is already `production`, so no schema change is needed for going-forward writes.

## Plan

### 1. Data backfill (one-shot, idempotent SQL)

Run via the data-insert tool (not a schema migration), wrapped in a transaction:

```sql
-- Promote April-onward non-production real legs to production.
-- Excludes admin_correction (kept for audit visibility) and any pre-April rows.
UPDATE public.general_ledger
SET classification = 'production'
WHERE transaction_date >= '2026-04-01'
  AND classification IN ('legacy_real', 'test_dev');
```

Then write a single audit row capturing what was promoted:

```sql
INSERT INTO public.audit_logs (action_type, table_name, record_id, action, reason, metadata)
VALUES (
  'ledger_classification_backfill',
  'general_ledger',
  gen_random_uuid(),
  'promote_april_to_production',
  'CEO directive: timestamp transactions from April going forward as production',
  jsonb_build_object('cutoff', '2026-04-01', 'promoted_from', ARRAY['legacy_real','test_dev'])
);
```

And a `system_events` entry: `ledger.classification.backfilled` with the same metadata + actual row counts.

### 2. Going-forward guard (DB trigger)

Add a `BEFORE INSERT` trigger on `general_ledger` that forces `classification = 'production'` when:
- `transaction_date >= '2026-04-01'`, **and**
- caller did not explicitly set `classification` to `'admin_correction'` (reconciliation/correction tooling must stay distinguishable)

This guarantees no new April-onward leg can sneak in as `legacy_real` or `test_dev`, even if an old code path tries.

### 3. Reconciliation refresh

Because 306 legs are moving into `production` scope, `wallet_ledger_truth_view` will report new drift for affected users. After the backfill we will:
- Re-query the view and surface the new drift count in the existing CFO **Ledger Reconciliation Panel**.
- No code change needed — the panel already picks up production-scope changes automatically.

### 4. No frontend changes required

All dashboards (`useCFOOverviewData`, `useFinancialStatements`, `DailyCashPositionReport`, `FinancialMetricsCards`, `AgentActivityChart`, `computeLedgerAvailable`, `approve-withdrawal`) already filter on `classification IN ('production','legacy_real')` or `= 'production'`. Promoting the rows to `production` makes them visible everywhere consistently — no query rewrites.

## Technical notes

- **Cutoff is inclusive**: `transaction_date >= '2026-04-01 00:00:00+00'` (UTC). Confirmed against current data: earliest April leg is `2026-04-01 00:00:00+00`.
- **`admin_correction` is intentionally preserved** so the `LedgerReconciliationPanel` and `WalletReconciliationAuditPanel` keep showing reconciliation pairs as a separate, auditable class. They still affect ledger net (truth view sums all production-scope rows AND corrections via `apply_wallet_movement`).
- **Pre-April rows are untouched** — `legacy_real` history before April stays where it is, so prior CFO reports don't shift retroactively.
- **Trigger placement**: `BEFORE INSERT ... FOR EACH ROW`, marked `SECURITY DEFINER`, `SET search_path = public`, and only acts when the row would otherwise be tagged non-production. Does not interfere with the existing `wallet.sync_authorized` write path.

## Out of scope

- Re-running historical CFO reports (numbers will shift forward only; that's the point).
- Migrating pre-April `legacy_real` rows.
- Changing how `admin_correction` is classified.
