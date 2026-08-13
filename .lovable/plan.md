# Landlord Ops: Reports & Exports Hub (centralized Extract)

Give Landlord Ops the same one-stop "Reports & Exports" experience that Tenant Ops already has, populated only with landlord reports that already exist. Every existing report stays exactly where it is today.

## What exists today (verified)

**Tenant Ops reference implementation** — `TenantOpsDashboard.tsx`, Workspaces tile "Reports & Exports" → `reports-hub` view, which renders one shared `reportsToolbar`:
From / To single-date pickers (shadcn Popover + Calendar, no default dates, Clear button) → one "Extract" dropdown whose items are grouped by labelled headings ("Tenants", "Repayments") with a separator → a "Print Report" button. Spinner on the trigger while extracting, `toast.success`/`toast.error` for results, buttons disabled during work.

**Landlord Ops** already has a `reports` view labelled "Reports & Exports" (reachable from the home cards). Today it holds only the Landlord Payouts print report plus a note telling managers where the other exports live. The other landlord exports that already exist:

| Existing landlord report | Lives in | Logic |
|---|---|---|
| Landlord verification pack (verified / pending / rejected / all) | All Landlords | `fetchLandlordReport` + `generateLandlordVerificationReportPdf` |
| Landlords Funded pack (KPIs, trend, per district/agent/service centre) | Landlords Paid | `fetchLandlordFundedStats` + `generateLandlordFundedReportPdf` |
| House verification pack | Verify Houses | `ops_house_listing_report` + `generateHouseVerificationReportPdf` |
| LC1 chairperson register pack | LC1 Chairpersons | `ops_lc1_verification_report` + `generateLc1VerificationReportPdf` |
| LC1 inbox export | LC1 Inbox panel | same RPC + generator |
| Landlords with tenants (spreadsheet) | Landlords with tenants view | `downloadXlsx` |
| Landlord payouts report | Reports & Exports | `generateLandlordOpsReportPdf` |

No new report is created; nothing is moved, hidden or removed.

## What gets built

Upgrade the existing landlord `reports` view into the hub, using the Tenant toolbar pattern verbatim:

```text
Landlord Ops → Reports & Exports
  [From ▾] [To ▾] [Clear]   [Extract ▾]   [Print Report]

  Extract ▾
    Landlords
      Verified landlords (PDF)
      Pending landlords (PDF)
      Rejected landlords (PDF)
      All landlords (PDF)
      Landlords with tenants (spreadsheet)
    ── Payments
      Landlords funded pack (PDF)
      Landlord payouts report (PDF)
    ── Properties
      House verification pack (PDF)
    ── LC1 chairpersons
      Verified / Rejected / Pending / All LC1 (PDF)
```

- The From/To pickers are the same components with the same behaviour (no defaults, optional, Clear, `dd MMM yyyy`) and feed the date-aware reports: landlord verification, landlords funded, landlord payouts. Reports whose existing logic has no date dimension (house pack, LC1 packs) keep their current scope semantics.
- Every item calls the report's existing fetch + existing PDF/XLSX generator, so filenames, layout, totals and toasts stay identical to the originals.
- Landlord-only data: each entry reuses the landlord RPCs/services listed above; no tenant query is reused or renamed.
- Permissions unchanged: the hub is inside the same Landlord Ops dashboard, and the underlying RPCs keep their own authorization.
- Responsive: the same `flex flex-wrap` toolbar and grouped dropdown as Tenant Ops, so it behaves identically on phone, tablet and desktop.

## Technical notes

1. `LandlordOpsDashboard.tsx`: build a `reportsToolbar` element (mirroring the Tenant one) and render it in the `reports` view. Keep the current payouts card behaviour available through the same toolbar.
2. Make the four dashboard-level export handlers accept optional overrides (scope, dateFrom, dateTo) that default to today's on-screen filter state, so the in-section buttons behave exactly as now while the hub can pass an explicit scope/date range.
3. `exportLc1Report` currently lives inside the LC1 view body; lift it to component scope unchanged (counts derived from `lc1Groups`) so both the LC1 view and the hub call one implementation.
4. For the two exports owned by child components, move only their fetch+generate bodies into a small shared helper (`src/lib/landlordOpsExports.ts`) and have both the original component and the hub call it — identical output, no visible change:
   - LC1 inbox export (`Lc1VerificationInboxPanel`)
   - Landlords-with-tenants spreadsheet (`LandlordsWithTenantsView`)
5. Single `extracting` state keyed by report id drives the spinner/disabled states, matching Tenant Ops.
6. `TenantOpsDashboard.tsx` and every tenant export are left untouched.

## Verification

- Each hub item downloads the same file as its original location (same rows, totals, filename shape).
- Original buttons in All Landlords, Landlords Paid, Verify Houses, LC1 Chairpersons, LC1 Inbox and Landlords with tenants still work unchanged.
- Date range applies to the date-aware reports and is ignored (as today) by the others.
- Toolbar wraps cleanly with no horizontal scroll at mobile width; dropdown remains reachable.
