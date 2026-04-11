

# Flaws Found in the Outstanding Balance Registration Form

## Issues Identified

### 1. No Phone Number Validation
Phone fields (`landlordPhone`, `tenantPhone`, `lc1Phone`) accept any text — no format validation, no length check, no digit-only enforcement. A user could type "abc" and submit successfully. The screenshot shows Ugandan numbers (07xx), but the code doesn't enforce this.

**Fix**: Add regex validation for Ugandan phone format (07/03/04 prefix, 10 digits) on all phone inputs, with real-time formatting.

### 2. Missing Guarantor Consent for Outstanding Balance Flow
The outstanding balance path (lines 574-719) submits directly via `handleSubmit`, which checks `guarantorConsent` — but the outstanding balance UI section never renders the `<GuarantorConsentCheckbox>` component. The consent checkbox only appears in the non-outstanding flow (line 1048). This means the submit will always fail with "Please accept guarantor responsibility" for outstanding balance registrations.

**Fix**: Add `<GuarantorConsentCheckbox>` to the outstanding balance section before the submit buttons.

### 3. Duplicate Landlord Records Created Every Submission
Every submission inserts a new row into the `landlords` table (line 288-297) without checking if a landlord with the same phone already exists. Agents registering multiple tenants for the same landlord will create duplicate records.

**Fix**: Upsert on `phone` — check for existing landlord first, reuse the ID if found.

### 4. Duplicate LC1 Records Created Every Submission
Same issue as landlords — every submission creates a new `lc1_chairpersons` row (lines 304-316) without deduplication.

**Fix**: Upsert on `phone` for LC1 records too.

### 5. Outstanding Balance Minimum Too Low
The outstanding balance submit button is disabled only when `amount < 2000` (line 707), while the regular flow requires `amount >= 50000` (line 1062). A UGX 2,000 outstanding balance makes no business sense for a rent platform.

**Fix**: Raise the minimum for outstanding balance to match business logic (e.g., 50,000 UGX).

### 6. Daily Repayment Hardcoded to 30 Days
The outstanding balance flow hardcodes `duration` to `'30'` (line 549) and the UI shows "for 30 days" (line 688). There's no way for the agent to choose a different repayment period for outstanding balances, even though the `duration` state supports 30/60/90.

**Fix**: Add a duration selector for outstanding balance registrations, or clearly document that 30 days is intentional.

### 7. No Input Formatting for Currency Fields
The outstanding balance and rent amount fields strip non-digits but don't display formatted numbers (e.g., "1,200,000"). The screenshot shows raw "1200000" which is hard to read for large amounts.

**Fix**: Add comma formatting on display while keeping raw digits in state.

### 8. Village/Cell Location Not Required but Used as Property Address
For outstanding balance, `lc1Village` is used as the `property_address` fallback (line 293: `lc1Village.trim() || 'N/A'`), but the field isn't marked as required. If left empty, the landlord gets "N/A" as their property address.

**Fix**: Either make the Village/Cell field required in the outstanding flow, or add a dedicated property address field.

### 9. House Category Defaults to 'single-room' for Outstanding
Line 365 hardcodes `house_category: 'single-room'` for all outstanding balance registrations. This is inaccurate data — the agent should be able to specify the actual house type, or the field should be nullable.

**Fix**: Either add a house category selector to the outstanding flow or store `null` instead of a misleading default.

---

## Summary of Fixes

| # | Flaw | Severity |
|---|------|----------|
| 1 | No phone validation | Medium |
| 2 | Missing guarantor consent checkbox (blocks submission) | **Critical** |
| 3 | Duplicate landlord records | Medium |
| 4 | Duplicate LC1 records | Medium |
| 5 | Outstanding balance minimum too low (2,000 vs 50,000) | Low |
| 6 | Duration locked to 30 days | Low |
| 7 | No currency formatting on display | Low |
| 8 | Village used as address fallback without being required | Low |
| 9 | Hardcoded house category | Low |

The critical blocker is #2 — the guarantor consent checkbox is missing from the outstanding balance UI, so submissions will always be rejected. The rest are data quality and UX issues.

Shall I fix all of these, or focus on specific ones?

