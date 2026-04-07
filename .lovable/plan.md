## Add Inline Edit to Tenant Details in Tenant Ops

### What Changes

The `TenantDetailPanel.tsx` component currently displays tenant profile info (name, phone, city) as read-only text. We will add inline editing so managers in Tenant Ops can tap any field to edit it, save changes to the `profiles` table, and see the update immediately.

THEY SHOULD BE ABLE TO EDIT THE NUMBER OF DAYS, THE AMOUNT AND ALL OTHER DETAILS

### Implementation

**File: `src/components/executive/TenantDetailPanel.tsx**`

1. Add edit state (`isEditing`, `editValues` for `full_name`, `phone`, `city`) and a save/cancel flow
2. Replace the static profile card content with an edit mode that shows `Input` fields for name, phone, and city when the edit (pencil) icon is tapped
3. Add a pencil icon button next to the profile info to toggle edit mode
4. On save: update `profiles` table via Supabase, invalidate the `tenant-detail` query, show a success toast
5. On cancel: revert to original values and exit edit mode
6. Add loading state on save button to prevent double-submits
7. Log the edit action to `audit_logs` with the manager's user ID, the tenant ID, and what changed

### UX Flow

- Manager views tenant detail panel → sees a small pencil/edit icon on the profile card
- Taps it → name, phone, city become editable input fields
- Makes changes → taps "Save" (or "Cancel" to discard)
- On save → fields update in DB, toast confirms, view returns to read-only

### Technical Details

- Uses existing `Input` component from `@/components/ui/input`
- Uses `useAuth` hook to get the manager's user ID for audit logging
- Query invalidation via `useQueryClient` to refresh data after save
- Validation: name required, phone format basic check, city optional
- Audit log insert: `{ action: 'tenant_profile_edit', user_id: managerId, target_id: tenantId, details: { changes } }`