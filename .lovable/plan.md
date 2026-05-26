## Goal
Add a powerful but easy-to-use filter bar to the **Tenant Ops → Classic → Tenants whose Landlords were Funded** view (`TenantLocationBrowser.tsx`), covering the filter set I recommended.

## Reality check (what data exists today)
The two RPCs backing this view (`get_tenant_location_breakdown`, `get_tenants_at_leaf`) currently return only:
- location (country/region/district/ward), agent, landlord, rent_amount, photos.

They do **NOT** return: landlord-funded date, outstanding balance, funding source, verification status, tenant status, AI-ID flags. Those filters need backend changes.

I'll split the work into two phases so you see value fast.

---

## Phase 1 — Client-side only (ships immediately, no backend)

Add a sticky filter toolbar at the top of `TenantLocationBrowser` that applies to **every level** (country / region / district / ward / agent / landlord / tenant list):

1. **Rent amount band** chips: `Any · <500K · 500K–1M · 1M–3M · 3M–10M · 10M+ UGX` (computed from `rent_amount`).
2. **Has photos** chip (already partly there at leaf — promote it to top bar).
3. **Linked / Pending / Vacated** chips (already exist at leaf — promote).
4. **Sort menu** on the tenant leaf: `Rent ↓ · Rent ↑ · Name A→Z · Recently added` (recently added = client-side by `rent_request_id` order).
5. **Saved presets**: store up to 5 filter combos in `localStorage` as one-tap chips ("Save current view").
6. **Bulk action bar** when any filter is active: count + "Export filtered to CSV" + "Export filtered to PDF" (reusing existing PDF helpers).

## Phase 2 — Time window + money/status filters (needs backend migration)

Extend the two RPCs:

```text
get_tenant_location_breakdown(..., p_funded_since timestamptz, p_funded_until timestamptz)
get_tenants_at_leaf(..., p_funded_since timestamptz, p_funded_until timestamptz)
```

Both filter on the **landlord-payout posting date** from `general_ledger` (the moment the landlord was funded). Counts at every level recompute under the window.

New tenant leaf fields returned: `landlord_funded_at`, `outstanding_balance_ugx`, `funding_source` ('supporter' | 'angel' | 'partner' | 'cfo_direct'), `verified` (AI-ID present), `tenant_status`.

Frontend additions on top of Phase 1 toolbar:

7. **Time chips** (your main ask): `Last 24h · Last 7 days · Last 30 days · Last 90 days · All time · Custom range` (shadcn date-range popover).
8. **Outstanding** chips: `Paid up · Partial · Overdue · Defaulted`.
9. **Verification** chips: `AI-ID verified · Pending · Missing National ID`.
10. **Funding source** dropdown: Supporter / Angel / Partner / CFO Direct.
11. **Funded-amount band** (landlord payout amount, not rent): `<1M · 1–5M · 5–20M · 20M+`.
12. Time chips also re-color the region/country/district tiles (e.g. "Eastern Africa · 42 tenants funded in last 7 days").

---

## Files touched

**Phase 1** (frontend only):
- `src/components/executive/tenant-ops/TenantLocationBrowser.tsx` — new `<TenantOpsFilterBar>` component above breadcrumbs; thread filter state down to `TenantTileGrid`, `AfricaCountryPicker`, `UgandaRegionDistrictPicker`, `DistrictAreaPicker`, `TenantLeafList`.
- `src/lib/csvExport.ts` — reuse existing helper for filtered CSV export.
- `src/lib/tenantOpsFilters.ts` *(new)* — shared `applyClientFilters()` + `localStorage` preset helpers + types.

**Phase 2** (backend + frontend):
- New migration: `ALTER FUNCTION get_tenant_location_breakdown` + `ALTER FUNCTION get_tenants_at_leaf` to add the optional params and new return columns. Joins `landlord_payouts` / `general_ledger` (`category = 'landlord_payout'`) for funded-at and amount, `welile_trust_score_cache` for verification, `wallets`/billing tables for outstanding.
- `src/hooks/useTenantLocationBreakdown.ts` — pass new params, extend `TenantLeaf` type.
- `src/components/executive/tenant-ops/TenantLocationBrowser.tsx` — wire the new chips.

---

## Decision needed from you

Tell me which to do:

- **A. Ship Phase 1 now** (15-min change, no DB risk), then I'll do Phase 2 right after.
- **B. Skip Phase 1, jump straight to Phase 2** (bigger, needs a DB migration — I'll confirm exact column names by querying `general_ledger` / `landlord_payouts` first).
- **C. Do both back-to-back in this same turn.**

I recommend **C** so you get everything in one shot. Confirm and I'll execute.
