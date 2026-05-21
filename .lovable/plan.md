## Goal

Upgrade the **Active Tenants — Rent Plan Repayments** PDF (Tenant Ops → "Download Active Tenants (PDF)") so it:

1. Includes **defaulters** from **1 Jan 2026** onward (not just currently-active tenants).
2. Computes **Expected** correctly so Principal can never sit unrealistically close to Outstanding — Expected must always reflect the locked rent formula (Principal × 1.33^(days/30) + registration fee).
3. Adds **Landlord Name** and **Landlord Phone** columns.

All work is confined to the report generator. No DB/business‑logic changes.

---

## 1. Widen the dataset (defaulters since Jan 2026)

In `src/lib/activeTenantsReportPdf.ts → fetchAllRentRequests()`:

- Drop the `ACTIVE_STATUSES` `.in(...)` filter.
- Replace with: `disbursed_at >= '2026-01-01'` (so we only ever look at the production cutoff window already in memory, and only at rent_requests that actually moved money).
- Keep `.not('disbursed_at','is',null)` and the paged `range()` loop.
- Add `landlord_id`, `status`, `tenancy_status`, `tenancy_ended_at`, `outstanding_at_end`, `duration_days`, `access_fee`, `request_fee`, `registration_type`, `initial_outstanding_balance` to the SELECT.

Derive a per‑row **Status** label for the PDF:

- `Repaying` — `status in (funded, disbursed, repaying, active, approved)` and outstanding > 0 and not past end.
- `Defaulted` — outstanding > 0 AND (`tenancy_status='ended'` with reason indicating default, OR today > end_date + 7d grace).
- `Cleared` — outstanding ≤ 0.
- `Ended` — `tenancy_status='ended'` with outstanding = 0.

(Exact label set will be finalised in code; the point is one extra column so defaulters are visible.)

## 2. Fix the Expected calculation

The current fallback `expected = max(total_repayment, principal)` is what makes Principal ≈ Outstanding when `total_repayment` is missing. Replace with a true formula recompute:

- Import `calculateRentRepayment` from `src/lib/rentCalculations.ts` (the locked 33% monthly compound + reg-fee formula — already the constitution per `mem://business-model/rent-formula`).
- Also import `getEffectiveRentRequestAmounts` from `src/lib/rentRequestAmounts.ts` to handle `outstanding_balance` rent_requests (which intentionally skip the formula — see `mem://business-model/outstanding-balance-instant-active`).

Per-row logic:

```
if registration_type === 'outstanding_balance':
   principal  = initial_outstanding_balance
   expected   = getEffectiveRentRequestAmounts(r).totalRepayment
else:
   principal  = rent_amount
   stored     = total_repayment
   computed   = calculateRentRepayment(rent_amount, duration_days).totalRepayment
   expected   = max(stored, computed)   // never below formula, never below stored
outstanding  = max(0, expected - amount_repaid)
```

This guarantees Expected ≥ Principal × 1.33 + reg fee for every standard rent plan, so the Principal column will be visibly smaller than Expected, and Outstanding will reflect real arrears.

## 3. Add Landlord columns

- After collecting `tenant_id` and agent ids, also push `landlord_id` into the profile-fetch batch (single `profiles` query already exists — just add the ids, no extra round trip).
- Resolve `landlord = profiles.get(r.landlord_id) ?? { name: '—', phone: '—' }`.
- New columns inserted **between Tenant Phone and Agent Name**:
  - `Landlord Name` (width 32)
  - `Landlord Phone` (width 24)
- Trim other column widths slightly so the table still fits A4 landscape (≈ 800pt usable). Proposed widths:
  `# 8 / Tenant 32 / T.Phone 22 / Landlord 30 / L.Phone 22 / Agent 28 / A.Phone 22 / Status 16 / Principal 24 / Expected 24 / Outstanding 24 / Start 18 / End 18`.
- Update the totals row to match the new column count.

## 4. Cosmetic / metadata updates

- Title stays "Active Tenants — Rent Plan Repayments".
- Subtitle → "All tenants with a disbursed rent plan since 1 Jan 2026, including defaulters."
- Add a KPI: **Defaulters** (count where status label = Defaulted).
- Filename → `tenants-since-jan2026-YYYY-MM-DD.pdf`.
- Footer note → clarify: "Expected = Principal × 1.33^(days/30) + registration fee. Outstanding = Expected − Repaid."

---

## Files touched

- `src/lib/activeTenantsReportPdf.ts` — only this file.
- Button label in `src/pages/coo/reports/TenantOpsReport.tsx` (and the duplicate in `TenantOverviewList.tsx`) updated from "Active Tenants" → "Tenants Report (since Jan 2026)".

No DB migrations, no edge functions, no business‑logic changes.

## Open question

"Defaulter" today isn't a single DB flag. The proposal above infers it from `outstanding > 0` + past end date / ended tenancy. If you'd rather use a stricter rule (e.g. only `tenancy_end_reason IN ('default','evicted','abandoned')`), tell me and I'll lock that in before coding.
