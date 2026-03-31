

# Fix Landlord Operations — Edit/Delete Buttons + Show All Tenants Per Landlord

## Problem

1. **Edit and Delete buttons don't work** — The landlords list view (`view === 'landlords'`) returns early at line 593, but all dialogs (EditLandlordDialog, Delete confirmation) are rendered in the `home` view's return block (lines 1080-1173). When clicking Edit/Delete, the state variables are set but the dialogs never mount because the component has already returned.

2. **Only one tenant shown per landlord** — Currently uses `landlords.tenant_id` (single field), but landlords can have multiple tenants via `house_listings`. Need to cross-reference `house_listings` to show all tenants linked to each landlord.

## Plan

### 1. Move dialogs outside early-return views
In `src/components/executive/LandlordOpsDashboard.tsx`, restructure so the dialogs render regardless of which view is active. Instead of early-returning from each view, wrap the view content and dialogs together:

- Move the landlords view content into the final return block (or wrap with a fragment that always renders the dialogs)
- The EditLandlordDialog, Delete dialog, EditLC1Dialog, and AssignPersonDialog will render at the bottom of **every** view, not just `home`

### 2. Show all tenants per landlord from house_listings
Enhance the `allLandlords` query to also cross-reference `house_listings` for tenant associations:

- After fetching landlords, query `house_listings` for all `landlord_id`s to get `tenant_id` mappings
- Build a `landlordTenantsMap: Map<string, {name, phone}[]>` from the house_listings tenant data
- In the landlords list view, render all associated tenants (not just the single `tenant_id` from the landlords table)
- Each tenant row shows name + phone with call/WhatsApp links

### 3. Refetch after edit/delete
Ensure `refetch()` also refetches `allLandlords` query (currently it only refetches `listings`). Add the allLandlords refetch to `onSaved` and delete success callbacks.

---

**File to modify:** `src/components/executive/LandlordOpsDashboard.tsx`

**Technical approach:**
- Wrap all view returns with a fragment: `<>{viewContent}{dialogs}</>` pattern
- Add a secondary query join from `house_listings` grouped by `landlord_id` to get all tenants
- Use the existing `profileMap` batch-fetch pattern for tenant names

