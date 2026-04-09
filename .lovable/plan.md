# Partner Registration Form (Shared Link)

## Overview

Build a public partner registration form accessible via agent-shared links (e.g., `/register-partner?agent={id}&token={token}`), mirroring the existing tenant registration pattern. Partners fill in personal details, investment amount (with auto-calculated 15% monthly ROI), and payout preferences. Submissions land in the Partner Operations dashboard for review.

## Architecture

```text
Agent Dashboard → Generate Token → Share Link
                                      ↓
                         /register-partner?agent=X&token=Y
                                      ↓
                         RegisterPartnerPublic.tsx (form)
                                      ↓
                         submit-partner-form (Edge Function)
                                      ↓
                      Validates token → Creates supporter_invites row
                                      (status: pending_review, role: supporter)
                                      ↓
                         Partner Operations Dashboard (existing queue)
```

## Changes

### 1. New Page: `src/pages/RegisterPartnerPublic.tsx`

Modeled on `RegisterTenantPublic.tsx` but simpler — single-step form with:

**A. Personal Details:**

- Full Name, Phone Number, Email Address, Residence/Location

**B. Investment Details:**

- Amount to Invest (UGX) input
- Auto-calculated read-only display: `Monthly ROI (15%): UGX {amount * 0.15}`
- Subtext: "You will earn this amount every 30 days."
- Optional: "Estimated Annual Earnings: UGX {amount * 0.15 * 12}"

**C. Payment Preferences:**

- Select: Mobile Money / Bank Transfer / Airtel Money
- Conditional fields: Mobile Money Number (for MTN/Airtel) or Bank Name + Account Name + Account Number (for bank)

**D. Footer:** Persistent agent name & phone (same `AgentFooter` pattern)

**E. Marketing Insight:** After entering investment amount (debounced 1s / onBlur, once per session), show annual earnings popup similar to the tenant rent insight.

### 2. New Edge Function: `supabase/functions/submit-partner-form/index.ts`

- Validates token via `agent_form_tokens` (expiry, usage count)
- Increments token `uses_count`
- Server-side recalculates ROI (never trusts frontend)
- Inserts into `supporter_invites` with:
  - `created_by`: agent_id from token
  - `role`: 'supporter'
  - `status`: 'pending'
  - `full_name`, `phone`, `email`
  - `property_address` (used for residence/location)
  - `payment_method`, `mobile_network`, `mobile_money_number`, `bank_name`, `account_name`, `account_number`
  - Generates `activation_token` and `temp_password`
- Returns success response

### 3. Route Registration: `src/App.tsx`

- Add: `<Route path="/register-partner" element={<RegisterPartnerPublic />} />`

### 4. Agent Menu Integration

- `**AgentMenuDrawer.tsx**`: Add `onSharePartnerForm` prop and menu item (icon: `UserPlus`, label: "Share Partner Form", badge: "🤝")
- `**AgentDashboard.tsx**`: Wire `onSharePartnerForm` handler that reuses `generate-tenant-form-token` to create a token, then builds URL `/register-partner?agent={id}&token={token}` and shares/copies it

### 5. No Database Migration Needed

- Reuses existing `agent_form_tokens` table for token validation
- Reuses existing `supporter_invites` table for storing the registration
- All required columns already exist in the schema

## Validation Rules

- Full Name: required, 2-100 chars
- Phone: required, trimmed
- Email: required, valid format
- Residence: required
- Investment Amount: required, minimum UGX 100,000
- Payment Method: required, with conditional sub-fields
- ROI: server-calculated only (15% flat monthly)