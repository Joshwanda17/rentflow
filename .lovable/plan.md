

# Generate Ledger Classification Report

## Task
Export all `general_ledger` entries to a CSV file with their classification tags. No data changes.

## Steps

1. **Query the database** using `psql` to export all ledger entries with columns: `id`, `user_id`, `category`, `direction`, `amount`, `classification`, `ledger_scope`, `created_at`
2. **Generate summary CSV** with per-category aggregates: category, classification, entry count, total cash_in, total cash_out, net
3. **Output** both files to `/mnt/documents/`

## Output Files
- `ledger_classification_2026-04-10.csv` — full per-entry report
- `ledger_summary_by_category_2026-04-10.csv` — aggregated category summary

## Technical Detail
Since the `classification` column was already populated in the migration, this is a simple `SELECT` + `COPY TO CSV` operation. Read-only, zero writes.

