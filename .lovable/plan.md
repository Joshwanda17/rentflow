

## Plan: Fix Outstanding Balance Tenant Registration Feedback

### Problem
When an agent registers a tenant with an existing outstanding balance, the submission completes but:
1. The success screen says "Request Posted! The rent request is now visible to supporters" — misleading for outstanding balances which are debt registrations, not fundable rent requests
2. No confirmation that the tenant account was actually created/linked
3. No way to distinguish outstanding balance entries from regular rent requests in the "My Tenants" list

### Changes

**File 1: `src/components/agent/AgentRentRequestDialog.tsx`**
- Update the success screen to show different messaging when `incomeType === 'outstanding'`:
  - Title: "Tenant Registered!" instead of "Request Posted!"
  - Description: "Outstanding balance of UGX X has been recorded for [tenant name]" instead of supporter-related text
  - Show tenant name, amount, and duration in a summary card
  - Keep the activation link section as-is (still needed for new tenants)
- Store `incomeType` in a ref or state that persists into the success screen (currently it's available since the form state isn't reset until dialog closes)

**File 2: `src/components/agent/AgentTenantsSheet.tsx`**
- When displaying tenant rent requests in the expanded view, add a badge/indicator for entries where `registration_type === 'outstanding_balance'`
- Fetch `registration_type` in the rent request select query
- Show a distinct "Outstanding Balance" badge (amber) vs regular rent requests

### Technical details
- No database changes needed — `registration_type` column already exists on `rent_requests`
- Success screen conditionally renders based on `incomeType` state which is preserved until dialog close
- Badge in tenant list uses existing `Badge` component with amber styling

### Files
- **Edit**: `src/components/agent/AgentRentRequestDialog.tsx` — Conditional success screen for outstanding flow
- **Edit**: `src/components/agent/AgentTenantsSheet.tsx` — Add outstanding balance badge to tenant request list

