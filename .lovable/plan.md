## Goal

The Landlord Ops dashboard already has an "All Requests" tab, but it shows columns in a different order (Landlord-first) and is missing the Action/Delete column. The user wants it to look **exactly like the Tenant Ops "All Requests" table** shown in the screenshot.

## What changes

Update the **Landlord Ops dashboard's existing "All Requests" view** so its columns, ordering, status pills, filters, and Action column match the Tenant Ops version one-to-one.

### Target column order (per screenshot)
1. Date
2. Tenant
3. Phone (tenant phone)
4. Status (colored pill, underscores replaced with spaces)
5. Amount (formatted)
6. Repaid (formatted)
7. Current Agent (italic muted "Unassigned" when missing)
8. Landlord
9. L. Phone
10. Action — Delete button (red ghost) + bulk delete

### Implementation details

File: `src/components/executive/LandlordOpsDashboard.tsx`

1. **Replace `allRequestsColumns`** with the Tenant-Ops column definitions in the exact order above (re-using the same status color map and the same "Unassigned" agent renderer).
2. **Add an Action column** with a red ghost Delete button that opens a confirm dialog and removes the rent request (matches Tenant Ops behavior, scoped to `rent_requests` row id since this view is request-centric).
3. **Add bulk delete** using `selectedIds` + `bulkActions` props on `ExecutiveDataTable`, identical to Tenant Ops.
4. **Add a small local state** for the single-row delete dialog and bulk delete dialog (mirroring Tenant Ops pattern). On confirm, delete from `rent_requests` by id, invalidate `['exec-landlord-ops-all-requests']`, toast success/error.
5. **Keep the existing status filter** (already matches Tenant Ops).
6. **Keep the existing data query** (`exec-landlord-ops-all-requests`) — it already returns every field needed (`tenant_name`, `tenant_phone`, `landlord_name`, `landlord_phone`, `agent_name`, `rent_amount`, `amount_repaid`, `status`, `created_at`).
7. **Audit log** every delete with `action_type: 'delete_rent_request_landlord_ops'`, `table_name: 'rent_requests'`, `record_id`, and a 10+ char reason ("Deleted from Landlord Ops All Requests view").

### Out of scope
- No schema changes.
- No changes to the Tenant Ops dashboard.
- No changes to other Landlord Ops sub-views.
- The "All Requests" nav card already exists and is correctly wired — just refining the table.

### Acceptance
Opening Landlord Ops → All Requests shows the same column layout as the screenshot (Date, Tenant, Phone, Status pill, Amount, Repaid, Current Agent, Landlord, L. Phone, Action), with status filter, search, CSV/PDF export (already provided by `ExecutiveDataTable`), single-row delete and bulk delete working end-to-end.
