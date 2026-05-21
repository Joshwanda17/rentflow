## Add "Extract Report" button to Landlord Ops → Landlords & Tenants

Add an export button on the **Landlords & Tenants** view inside Landlord Operations that downloads a fully-detailed spreadsheet — one row per landlord ↔ tenant pairing with every relevant landlord, tenant and rent-plan field as its own column.

### Where the button goes

File: `src/components/executive/landlord-ops/LandlordsWithTenantsView.tsx`

Place a `Download Report` button in the filter bar next to the search input (top right). Uses the existing `Button` + `Download` icon. Honors the current search + status filter so the user can scope the export.

### Data the export will pull

A dedicated query (independent of the on-screen grouped query — needs more columns) hitting:

- `landlords` — id, name, phone, verified, mobile_money_name, mobile_money_number, bank_name, account_number, village, district, region, number_of_houses, monthly_rent, caretaker_name, caretaker_phone, tin
- `rent_requests` — id, tenant_id, landlord_id, registration_type, rent_amount, total_repayment, amount_repaid, daily_repayment, duration_days, status, created_at, funded_at, disbursed_at, completed_at, initial_outstanding_balance
- `profiles` (tenants) — id, full_name, phone, national_id
- `house_listings` — landlord_id, tenant_id, title, address, monthly_rent (to surface landlord↔tenant links that don't yet have a rent_request)

All three queries paginate with the existing 1000-row `while` loop pattern already used in the view (per `mem://architecture/high-scale-ops-automation`).

### Row shape (one row per pairing)

Each row is a flat record. Pairings come from:
1. Every `rent_requests` row (one row per request).
2. House-listing tenant links and `landlords.tenant_id` links that have no rent_request → one row each with rent-plan columns blank.
3. Landlords with no linked tenant at all → one row with tenant columns blank (so all ~325 landlords appear).

### Columns (in order)

| Group | Columns |
|---|---|
| Landlord | Landlord ID, Landlord Name, Landlord Phone, Verified, MoMo Name, MoMo Number, Bank, Account #, Village, District, Region, # Houses, TIN, Caretaker Name, Caretaker Phone, Listed Monthly Rent |
| Tenant | Tenant ID, Tenant Name, Tenant Phone, National ID |
| Linkage | Link Source (rent_request / house_listing / landlord.tenant_id / none), House Title, House Address |
| Rent Plan | Request ID, Registration Type (normal / outstanding_balance), Status, Rent Amount (Principal), Total Repayment (Expected), Amount Repaid (Collected), Outstanding, Daily Repayment, Duration (days), Initial Outstanding Balance, Created At, Funded At, Disbursed At, Completed At |
| Computed | Rent Disbursed (UGX) — `rent_amount` when `disbursed_at` is set, else 0; Collection Rate % — `amount_repaid / total_repayment` |

All currency columns written as numbers (not strings) so the user can sum/filter in Excel.

### Export format

Use the existing `downloadXlsx` helper at `src/lib/xlsxExport.ts` — produces a single-sheet `.xlsx` with frozen header row and auto-sized columns. Filename: `landlord-ops-extract-YYYY-MM-DD.xlsx`.

Also include a small "Summary" footer/sheet? **No** — keep it as a single flat sheet so the user can pivot freely. Totals are trivial to compute from the columns.

### UX

- Button states: idle → "Download Report" / loading → spinner + "Building…" / success toast: "Downloaded N rows".
- Disabled while loading.
- Export respects the current search + status filter applied on the view.

### Files touched

1. `src/components/executive/landlord-ops/LandlordsWithTenantsView.tsx` — add button, add `buildExtractRows()` helper + `handleExport()` async fn that runs the dedicated pull, flattens, then calls `downloadXlsx`.

No DB migration, no edge function, no backend change.
