

## Block tenant phone == landlord phone (and LC1) on agent forms

### Problem
When an agent posts a rent request for a tenant, nothing prevents them from entering the **same phone number** for both the tenant and the landlord (a clear data integrity error — one person can't be both). Same risk exists with the LC1 phone.

### Fix scope
Add a real-time, blocking validation across the two agent-facing forms that collect both numbers.

**1. `src/components/agent/AgentRentRequestDialog.tsx`** (primary form)
- In `collectValidationErrors(...)`, after the tenant/landlord/LC1 phone format checks, compare the **cleaned** (whitespace-stripped) phone numbers and push hard errors:
  - If `cleanTenantPhone === cleanLandlordPhone` → "Tenant and Landlord phone numbers cannot be the same"
  - If `cleanTenantPhone === cleanLc1Phone` → "Tenant and LC1 phone numbers cannot be the same"
  - If `cleanLandlordPhone === cleanLc1Phone` → "Landlord and LC1 phone numbers cannot be the same"
  (Only compare when both fields are non-empty and pass format validation.)
- Add an inline red helper under the **Landlord Phone** input (line ~739) and **LC1 Phone** input that shows live the moment the typed landlord/LC1 phone equals the tenant phone — same pattern already used for "Invalid Ugandan phone number".
- Keep the existing `hasFieldError(...)` highlighting so the offending field gets the red border.

**2. `src/components/agent/RegisterTenantDialog.tsx`** (agent's "Register Tenant" form, also collects both)
- In the validation block (around line 149), add the same tenant-vs-landlord phone comparison (cleaned, case-insensitive) and `toast.error("Tenant and Landlord phone numbers cannot be the same")` returning early.
- Add a small inline warning under the landlord phone input mirroring the Rent Request dialog.

### Out of scope
- No DB / RPC / edge function changes — this is a pre-submit guard in the UI. The backend already de-dupes landlords by phone, so blocking at the form is sufficient.
- No changes to other forms that don't collect both numbers (e.g. tenant-side `RecordRent.tsx`, executive dashboards).
- Phone normalization stays as-is (whitespace-strip + `isValidUgPhone`); we're just comparing the same cleaned strings.

### Acceptance
- Entering the same phone in Tenant Phone and Landlord Phone on the agent rent request form shows a red inline message under Landlord Phone immediately, and the **Submit** attempt is blocked with toast: *"Tenant and Landlord phone numbers cannot be the same"*.
- Same rule applies between Tenant↔LC1 and Landlord↔LC1 on the rent request form.
- Same rule applies on the Register Tenant dialog (Tenant↔Landlord).
- All other validations (format, required, National ID) continue to work unchanged.

