

# Revamp Public Tenant Registration Form — Full Rent Request Flow

## Overview
Replace the current simple 5-field `RegisterTenantPublic.tsx` with a multi-step flow that mirrors `AgentRentRequestDialog.tsx`. The public form becomes a complete rent request pipeline: Income Type Selection → Full Form (rent details, tenant, house category, landlord, property + GPS + photos, LC1, guarantor consent) → Submission. The edge function `submit-tenant-form` is expanded to create a full `rent_request` record (not just a `supporter_invites` entry).

## Flow
```text
Link opens → Validate token → Income Type (Daily / Weekly-Monthly, NO outstanding)
    → Full form (scrollable page, not dialog):
       A. Rent Details (amount, duration/period, repayment preview)
       B. Tenant Details (no-smartphone toggle, name, phone)
       C. House Category (dropdown)
       D. Landlord Details (name, phone)
       E. Property Details (address, GPS capture, house photos max 3)
       F. LC1 Chairperson (name, phone, village)
       G. Guarantor Consent Checkbox
    → Submit → Success screen
    → Agent footer persists on all steps
```

## Changes

### 1. `src/pages/RegisterTenantPublic.tsx` — Complete rewrite
- **Step 1: Income Type** — Reuse the two-button selector (Daily / Weekly-Monthly). No "Outstanding Balance" option.
- **Step 2: Form** — Full scrollable form matching `AgentRentRequestDialog` sections A–G:
  - Rent amount + duration selector (30/60/90 for daily; 7/14/21/30/120 for weekly-monthly)
  - Repayment preview card (daily amount, start date)
  - Tenant name + phone + no-smartphone toggle
  - House category dropdown (same `HOUSE_CATEGORIES` array)
  - Landlord name + phone
  - Property address + GPS capture button + house photos (max 3, stored as base64 to send to edge function)
  - LC1 name + phone + village
  - `GuarantorConsentCheckbox` component (already exists)
- **Agent footer** on all steps showing agent name and phone
- **Validation**: Cannot submit unless income type selected, required fields filled, guarantor checked, token valid
- Uses `calculateRentRepayment` and `formatUGX` from `src/lib/rentCalculations.ts` for the repayment preview

### 2. `supabase/functions/submit-tenant-form/index.ts` — Expanded to create full rent request
Currently: creates tenant user + `supporter_invites` entry only.

**New**: After creating the tenant user, also:
- Accept new fields: `income_type`, `rent_amount`, `duration_days`, `repayment_period`, `house_category`, `landlord_name`, `landlord_phone`, `property_address`, `gps_lat`, `gps_lng`, `lc1_name`, `lc1_phone`, `lc1_village`, `no_smartphone`, `house_photos` (base64 array)
- Create `landlords` record (name, phone, property_address, registered_by = agent_id)
- Create `lc1_chairpersons` record (name, phone, village)
- Calculate fees server-side (same logic as client: access fee + request fee)
- Insert `rent_requests` row with all fields (tenant_id, agent_id, landlord_id, lc1_id, rent_amount, duration_days, access_fee, request_fee, total_repayment, daily_repayment, house_category, tenant_no_smartphone, request_latitude, request_longitude, status='pending')
- Upload house photos to `house-images` bucket using service role (bypasses RLS)
- Update `rent_requests.house_image_urls` with uploaded URLs
- Return success with rent_request_id

### 3. Storage policy addition (migration)
Add an RLS policy allowing the service role to upload to `house-images` bucket for public form submissions. The service role already bypasses RLS, so no migration needed — the edge function uses `SUPABASE_SERVICE_ROLE_KEY`.

### 4. No route or dashboard changes needed
- Route `/register-tenant` already exists
- Agent share button already works
- Submissions land in `rent_requests` with `status='pending'` which Tenant Ops already picks up

## Files changed
1. `src/pages/RegisterTenantPublic.tsx` — full rewrite with multi-step form
2. `supabase/functions/submit-tenant-form/index.ts` — expand to create landlord, LC1, rent_request, upload photos

