

# Add "Update Contribution Dates" Upload Section to COO Partners Page

## What We're Building

A **separate** dialog/section from the existing Import — dedicated to bulk-updating contribution dates on existing portfolios via file upload. After upload, the COO sees a table of matched portfolios with their owners and can **edit dates inline** before saving.

## Plan

### 1. Create `UpdateContributionDatesDialog.tsx`

New component in `src/components/coo/` with a multi-step flow:

**Step 1 — Upload**
- Accept `.xlsx` with columns: Partner Name (or Phone), Investment Amount, Contribution Date
- Reuse the existing `parseContributionDate()` logic for robust date parsing (Excel serials, ISO, US, EU formats)
- Download template button with sample data

**Step 2 — Preview & Edit**
- Match each uploaded row to existing `investor_portfolios` by joining on partner name/phone + investment amount
- Show a table with columns:
  - Partner Name
  - Portfolio Reference
  - Investment Amount
  - Current Contribution Date
  - **New Contribution Date** (editable date picker per row)
  - Match Status (Matched / Not Found)
- Unmatched rows flagged in amber, skipped on save
- COO can adjust any date before confirming

**Step 3 — Confirm & Save**
- On confirm, update each matched portfolio:
  - `created_at` → new contribution date
  - `payout_day` → `Math.min(newDate.getDate(), 28)`
  - `next_roi_date` → new contribution date + 1 month
  - `maturity_date` → new contribution date + duration months
- Show success/failure summary via toast

### 2. Wire into `COOPartnersPage.tsx`

- Add state: `updateDatesOpen`
- Add a **"📅 Update Dates"** button in the filters bar, next to the existing Import button
- Render `<UpdateContributionDatesDialog>` and refresh partner data on success

### 3. No Database Migration Needed

All updates target existing columns on `investor_portfolios` (`created_at`, `payout_day`, `next_roi_date`, `maturity_date`).

---

**Files to create:** `src/components/coo/UpdateContributionDatesDialog.tsx`
**Files to edit:** `src/components/coo/COOPartnersPage.tsx`

