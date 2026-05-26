## What you'll see

Each row in **Tenants Whose Landlords Were Funded** gains a **"Open profile"** button (next to Share). Tapping it opens a wide **User Drilldown drawer** with three sub-tabs at the top:

`[ Tenant ] [ Agent ] [ Landlord ]`

Each tab is its own editor for that person. From the Landlord tab there is a 4th nested action **"Link funder"**.

Every editable field saves through a single guarded RPC — no direct table writes from the client — and is logged in `audit_logs` with a 10-char reason.

## Drawer contents per role

**Common (every user)**
- Full name, phone, role badges, dashboards they can access (read-only list derived from `user_roles`)
- **Location editor** — reuses the existing `AddressFormFields` + GPS capture from `AgentContactLocationGate` (continent → district → village + optional GPS)

**Tenant tab**
- Current rent request: amount, daily repayment, **rent balance (amount_repaid vs total)**, status
- Inline edit: rent amount, daily repayment, missed-day note
- **Linked agent** with "Change agent" picker → reuses the existing `TenantAgentLinker` reassign RPC

**Agent tab**
- Tenant count, total rent under management, commission YTD (read-only, from `v_user_wallet_strict`)
- **Linked landlord(s)** — list with "+ Link landlord" picker that writes to `agent_landlord_assignments`

**Landlord tab**
- Landlord profile + payout MoMo details (edit name/phone/provider)
- **Rentals listed**: count from `house_listings`, with inline +/- (open a quick "Add listing" mini-form)
- **Linked funder(s)** — list with "+ Link funder" picker that writes to a new `landlord_funder_links` table
- LC1 chairperson row shown as **"Not configured — coming soon"** (skipped per your instruction)

## Permissions

Visible / editable only when the viewer has one of:
- `manager` or `super_admin` — full edit on every field
- `coo`, `tenant_ops`, `landlord_ops` — edit everything except role assignment
- `agent` — can only open the drawer for **their own** tenants and edit location + rent details; agent/landlord/funder linking is hidden

Enforced both in the UI and inside the new RPCs / RLS.

## Technical plan

### 1. New shared component
`src/components/ops/UserDrilldownDrawer.tsx` — Sheet-based wide drawer with the 3 tabs above. Props: `{ tenantId?, agentId?, landlordId?, openTab? }`. Tabs lazy-load their queries.

### 2. New sub-components (small, focused)
- `src/components/ops/drilldown/TenantPane.tsx`
- `src/components/ops/drilldown/AgentPane.tsx`
- `src/components/ops/drilldown/LandlordPane.tsx`
- `src/components/ops/drilldown/LinkPicker.tsx` (reusable `UserSearchPicker` wrapper for tenant→agent, agent→landlord, landlord→funder)
- `src/components/ops/drilldown/LocationEditor.tsx` (extracts the address form from `AgentContactLocationGate` so both surfaces share it)

### 3. New hook
`src/hooks/useDrilldownPermissions.ts` — returns `{ canEditLocation, canEditFinancial, canEditRoles, canLink }` based on active role + ownership.

### 4. Database migration
- New table `landlord_funder_links` (landlord_id, funder_id, linked_by, reason, active, timestamps; unique active link per pair).
- RLS: ops roles full access; agents read-only on their own landlords.
- New SECURITY DEFINER RPCs (all enforce role + 10-char reason + audit log):
  - `ops_update_user_location(p_user_id, p_address_jsonb, p_lat, p_lng, p_reason)`
  - `ops_update_rent_request(p_request_id, p_changes_jsonb, p_reason)`
  - `ops_link_landlord_funder(p_landlord_id, p_funder_id, p_reason)`
  - `ops_link_agent_landlord(p_agent_id, p_landlord_id, p_reason)` (tenant→agent reuses existing `reassign_tenant_to_agent` RPC)

### 5. Wire-up
- `FundedTenantsList.tsx` row: add **"Open profile"** button → opens drawer with `tenantId`, `agentId`, `landlordId` from the row, defaults to **Landlord** tab.
- Also expose the drawer from `TenantOpsDashboard` (search box → open by tenant) so the same UI works outside the funded list.

### 6. Memory
After landing, add a project-memory leaf `mem://features/ops/user-drilldown` documenting the shared drawer, the four RPC guardrails, and the LC1 skip.

## Out of scope (you asked me to skip)
- LC1 chairperson linking — UI shows "coming soon"; will wire up when you confirm the data model.

## Risk notes
- Editing rent amounts on an active `rent_requests` row affects revenue recognition. The RPC will refuse to change `amount` or `daily_repayment` once `status = 'completed'` or `amount_repaid > 0`; instead surfaces a "Create adjustment" path (out of scope here — placeholder button only).
- Role list and dashboards remain **read-only** in this iteration; toggling a role rewires the entire app for that user and needs its own approval flow.

Approve and I'll build it end-to-end in this loop (migration first, then UI).
