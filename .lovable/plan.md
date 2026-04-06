

# Restructure Outstanding Balance Form — Two-Section Layout

## What Changes

When `incomeType === 'outstanding'`, replace the current form layout (which shows all the same fields as daily/weekly modes) with a **simplified two-section form** matching the user's spec:

**Section 1 — 🏠 Landlord Registration**
- Landlord Name* (full name)
- Landlord Phone* (example placeholder: 0700 123 456)
- Village/Cell Location (📍 Village/Cell)
- LC1 Chairperson subsection:
  - LC1 Name
  - LC1 Phone
- "Create Landlord" action button (optional UX — or just inline, see below)

**Section 2 — 👤 Tenant Registration**
- Tenant Name (full name)
- Tenant Phone (Primary) (example: 0700 123 456)
- Outstanding Balance (UGX) — direct amount entry
- "Register Tenant" submit button

**Removed from outstanding mode**: House category selector, GPS capture, house photos, no-smartphone toggle, duration selector, fee summary cards.

## Technical Details

### File: `src/components/agent/AgentRentRequestDialog.tsx`

**Step selection** — no changes (outstanding card already works).

**Details step** (`step === 'details'` when `incomeType === 'outstanding'`) — replace the entire rendered block with:

1. **Warning banner** at top (keep existing amber banner about no fees)

2. **Landlord section** — card with `Building2` icon header "Landlord Registration":
   - `landlordName` + `landlordPhone` (2-col grid)
   - `lc1Village` → relabeled as "Village/Cell Location"
   - LC1 subsection: `lc1Name` + `lc1Phone` (2-col grid)

3. **Tenant section** — card with `User` icon header "Tenant Registration":
   - `tenantName` + `tenantPhone` (2-col grid)
   - `outstandingBalance` — full-width input

4. **Submit button**: "Register Tenant" (amber themed)

**Validation** (`handleSubmit`) — when outstanding mode, skip `houseCategory` check. Set `houseCategory` to a default value (e.g., `'single-room'`) or make it nullable in the insert.

**Fee calculation** — keep existing zero-fee logic; hardcode `durationDays: 30`.

**Submission** — same landlord → LC1 → tenant → rent_request flow, but `house_category` set to `'outstanding'` or omitted if nullable. No GPS or photo upload in this mode.

### Summary of changes
| What | Detail |
|------|--------|
| Modify | Outstanding balance details step — completely new section layout |
| Modify | Validation in `handleSubmit` — skip house category for outstanding mode |
| No new files | All changes in `AgentRentRequestDialog.tsx` |

