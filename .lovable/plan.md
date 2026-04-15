

## Plan: Add Internship Applications to Staff Panel

### What changes

1. **New sidebar item** in `executiveSidebarConfig.ts` under the `hr` section: "Internship Applications" with a `GraduationCap` icon and id `internships`

2. **New component** `src/components/hr/HRInternshipApplications.tsx` — A table view showing all submissions from `internship_applications`:
   - Columns: Full Name, Phone, Email, Motivation, Skills, Ready to Learn, Referral Code, Applied At
   - Sorted by newest first
   - Status badges (ready/exploring)
   - Simple, clean table with search/filter

3. **Wire into HR Dashboard** (`src/pages/hr/Dashboard.tsx`) — Add `case 'internships'` to the switch, rendering the new component

### Also visible to Manager/COO

Add the same sidebar item under `manager` and `coo` sections in `executiveSidebarConfig.ts`, since the RLS read policy already grants access to `manager`, `super_admin`, `coo`, and `hr` roles.

### Files

- **Edit**: `src/components/layout/executiveSidebarConfig.ts` — Add "Internship Applications" item to `hr`, `manager`, `coo` sections
- **New**: `src/components/hr/HRInternshipApplications.tsx` — Table component
- **Edit**: `src/pages/hr/Dashboard.tsx` — Add case for `internships`
- **Edit**: `src/pages/COODashboard.tsx` (if it uses same pattern) — Add case
- **Edit**: Manager dashboard — Add case

No database changes needed — table and RLS already exist.

