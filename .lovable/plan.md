## Goal

Add a new "How many funded (PDF)" report to the Tenant Ops dashboard's Extract menu, alongside the existing Applied / Approved / Collected / Expected reports. It lists every tenant whose rent has actually been funded (money moved out to the landlord, or rent_request flipped to funded/disbursed) inside the selected date window.

## What changes (one file)

`src/components/executive/TenantOpsDashboard.tsx`

1. Extend the `extracting` state union to include `'funded'`.
2. Add a new `handleExtractFunded()` that:
   - Pulls rows from `rent_requests` where `status` is in the post-funding set: `funded`, `disbursed`, `active`, `repaying`, `completed`.
   - Windows by `COALESCE(funded_at, approved_at, created_at)` using the same dual-`.or()` pattern already used by Approved (catches rows where `funded_at` was never stamped and falls back to a sensible timestamp; marks them "(inferred)" in the Status column).
   - Selects: `id, tenant_id, approved_by, rent_amount, total_repayment, daily_repayment, amount_repaid, funded_at, approved_at, created_at, status`.
   - Enriches tenant + funded-by names via the existing `enrichWithProfiles` helper.
   - Computes KPIs: # Funded, Total Funded (UGX), Total Repayable (UGX), Already Repaid (UGX), Stamped / Inferred count.
3. Render the PDF via the existing `generateTenantOpsExtractPdf` with columns:
   `# | Tenant | Phone | Rent (UGX) | Total Repay | Daily (UGX) | Repaid (UGX) | Funded | Funded By | Status`
   Footer note explains the "inferred" tag and what counts as funded.
4. Add a new dropdown item under the existing "Tenants" group, between Approved and the Repayments separator:
   `How many funded (PDF)` with a `Wallet` (or `BadgeDollarSign`) icon.
5. File naming: `tenants-funded_<windowSuffix>.pdf`.

## Notes

- All extracts are already PDFs (the menu labels still say "(CSV)" for legacy reasons but the generator is `generateTenantOpsExtractPdf`). The new item label will read `(PDF)` to match reality. Existing labels are left alone in this change to avoid scope creep — happy to flip them in a follow-up if you want.
- No DB migration, no RLS change, no edge function. Pure client-side report.
- Uses the same date-window control already on the page (`reportFrom`/`reportTo`, default last 30 days).