

## Plan: Re-deliver Full Database Export via Documents Artifact

### Problem
The ZIP file in `public/welile_full_export.zip` cannot be downloaded from the preview URL. The preview server is unreliable for serving large binary files.

### Steps

1. **Re-export all 146 tables** to CSV using `psql COPY TO STDOUT` (no row limits)
2. **ZIP all CSVs** into `/mnt/documents/exports/welile_full_export_v2.zip`
3. **Deliver via `presentation-artifact`** — the platform's reliable download channel
4. **Delete `public/welile_full_export.zip`** to remove sensitive data from the public preview

### Build Error Note
The `GIT_FILES_NOT_LISTABLE` error is an internal platform issue unrelated to code changes — no action needed from us.

### Output
- Downloadable artifact: `exports/welile_full_export_v2.zip` — complete database, all rows

