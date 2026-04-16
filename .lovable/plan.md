

# Enhance Agent "My Tenants" Page for Field Operations

## What This Solves

Agents managing 100+ tenants (many without smartphones) need:
- Easy back navigation throughout the flow
- Bigger, readable fonts for small screens
- Ability to pay any amount from operations float (not just full outstanding)
- GPS capture on tenant profiles
- A shareable signup link so tenants can create their own dashboard when they get a smartphone

## Changes

### 1. Add Back Button to My Tenants Sheet Header
**File:** `AgentTenantsSheet.tsx`
- Add a visible "← Back" button in the sticky header next to "My Tenants" title that closes the sheet (`onOpenChange(false)`)

### 2. Increase Font Sizes for Small Smartphones
**Files:** `AgentTenantsSheet.tsx`, `TenantProfileView.tsx`
- Tenant name: `text-sm` → `text-base`
- Phone numbers: `text-xs` → `text-sm`
- Balance amounts: `text-sm` → `text-lg`
- Section headers: `text-xs` → `text-sm`
- All `text-[10px]` labels → `text-xs`
- All `text-[9px]` → `text-[11px]`
- Touch targets already meet 44px minimum — no changes needed there

### 3. Add "Pay from Float" Button on Tenant Profile
**File:** `TenantProfileView.tsx`
- Replace the current "Pay Rent" button (which calls `tenant-pay-rent` edge function using the tenant's own wallet) with a button that opens the `AgentTenantCollectDialog`
- Import and wire up `AgentTenantCollectDialog` inside `TenantProfileView`
- The dialog already supports any amount (min 500 UGX), quick-amount buttons, and shows float balance — no changes needed to the dialog itself

### 4. Add GPS Capture on Tenant Profile
**File:** `TenantProfileView.tsx`
- Add a "Capture GPS Location" button in the Contact Details section
- Use the existing `useGeoLocation` hook
- On capture, display lat/lng coordinates inline
- Store will be display-only for now (agent can reference when visiting tenant)

### 5. Add "Send Dashboard Link" Button on Tenant Profile
**File:** `TenantProfileView.tsx`
- Add a button below the contact section: "Send Dashboard Link"
- Uses `createShortLink` to generate a signup/login link with the tenant's phone pre-filled: `/auth?phone={tenant.phone}&ref={agent.id}`
- Triggers `navigator.share()` (or copies to clipboard as fallback) so agent can send via WhatsApp/SMS
- This lets tenants who later buy smartphones access their own dashboard

### 6. Improve Navigation in Tenant Profile Header
**File:** `TenantProfileView.tsx`
- Make the back button larger (`h-11 w-11`) with a text label "← Back" instead of icon-only
- Make tenant name in header `text-base font-bold` (currently `text-sm`)

## Technical Details

**Files modified:**
- `src/components/agent/AgentTenantsSheet.tsx` — back button, font scaling
- `src/components/agent/TenantProfileView.tsx` — font scaling, float payment integration, GPS capture, dashboard link sharing

**Existing components reused (no modifications):**
- `AgentTenantCollectDialog` — already handles partial amounts from float
- `useGeoLocation` hook — already built
- `createShortLink` — already built

