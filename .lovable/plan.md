

## Plan: Full Database Export Without Row Limits

### Problem
Previous Excel export capped sheets at 10,000 rows, truncating large tables.

### Steps

1. **Verify `psql` access** — check `$PGHOST` is set
2. **Get all public table names** from `information_schema.tables`
3. **Export each table to CSV** using `psql COPY TO STDOUT` — streams all rows, no cap
4. **ZIP all CSVs** into one archive
5. **Save to `/mnt/documents/welile_full_export.zip`**
6. **Verify row counts** on large tables to confirm completeness

### Output
- `/mnt/documents/welile_full_export.zip` — one CSV per table, complete data

