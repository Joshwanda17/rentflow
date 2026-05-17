## Goal

Let **Landlord Ops** bind a specific tenant (from an existing rent request) to a specific house, and swap that tenant if they abscond. Let **Agents** see, per landlord they manage, every house plus the tenant attached, and reassign the tenant or the managing agent.

## Data model (already in place — no migration needed)

- `house_listings.tenant_id` (nullable uuid) — the current occupant. This is the binding.
- `house_listings.agent_id` (uuid, NOT NULL) — the managing agent.
- `house_listings.landlord_id` (uuid) — owning landlord.
- `rent_requests.tenant_id` / `agent_id` / `landlord_id` — the request side.

Binding rules:
- **Assign tenant → house** = set `house_listings.tenant_id = <rent_request.tenant_id>` for a chosen `house_listings.id` owned by the same landlord.
- **Remove tenant (absconded)** = `tenant_id = NULL`, status → `available`.
- **Swap tenant** = atomic: clear old, set new.
- **Reassign managing agent** = update `house_listings.agent_id`.
- **Reassign tenant's agent on rent request** = update `rent_requests.agent_id` for that tenant's active request.

A "tenant placement" trigger already pays the listing agent a UGX 5,000 bounty the first time `tenant_id` flips from NULL → set, so the existing memory rule keeps working.

## Migration

One small migration to add three SECURITY DEFINER RPCs with strict authorization checks and audit logging — UI never writes `house_listings`/`rent_requests` directly for these ops:

1. `landlord_ops_bind_tenant_to_house(p_house_id, p_rent_request_id, p_reason)`
   - Asserts caller has `landlord_ops` department (via existing dept check) OR is `manager`.
   - Asserts rent_request.landlord_id matches house.landlord_id.
   - Sets `house_listings.tenant_id = rr.tenant_id`, `status = 'occupied'`.
   - Inserts `audit_logs` row (`action_type='tenant_bound_to_house'`, 10-char reason).
   - Emits `system_event` `house.tenant_bound`.

2. `landlord_ops_remove_tenant_from_house(p_house_id, p_reason)` (absconded / vacated)
   - Same auth.
   - Clears `tenant_id`, sets `status='available'`.
   - Audit + `house.tenant_removed` event.

3. `reassign_house_agent(p_house_id, p_new_agent_id, p_reason)` and
   `reassign_rent_request_agent(p_rent_request_id, p_new_agent_id, p_reason)`
   - Landlord Ops or manager only.
   - Asserts new agent has `agent` role.
   - Audit + `house.agent_reassigned` / `rent_request.agent_reassigned` events.

All RPCs `SET search_path = public` and use the standard `audit_logs` schema (`action_type`, `table_name`, `record_id`, mandatory reason ≥10 chars) per Audit Governance memory.

## UI changes

### Landlord Ops — `src/components/executive/LandlordOpsDashboard.tsx`

New row of actions inside each landlord card (or a new tab "Houses & Tenants"):
- **Bind Tenant to House** dialog: pick a house (filtered to that landlord, vacant or occupied), pick a pending/approved rent request for that landlord, type a ≥10-char reason. Confirm → calls RPC #1.
- **Remove Tenant (Absconded)**: on an occupied house card, "Remove Tenant" button → reason dialog → RPC #2.
- **Swap Tenant**: shortcut that calls #2 then #1 in sequence inside the same dialog.

Reuse `EmptyHouseActionDialog` patterns and `AssignPersonDialog` UX. No new top-level component beyond:
- `src/components/executive/landlord-ops/BindTenantToHouseDialog.tsx`
- `src/components/executive/landlord-ops/RemoveTenantDialog.tsx`

### Agent — `src/components/agent/AgentListingsSheet.tsx` (already lists houses they manage)

Per house card, add an "Attached tenant" line and two actions:
- **Change tenant profile** → opens existing `TenantProfileView` for the attached tenant in edit mode (no schema change; uses existing tenant profile editing path). For agents we only let them edit fields the agent role already controls.
- **Reassign tenant's agent**: select another agent from their downline (`SubAgentsList` data) → RPC #4.

Group the houses by landlord (the user's exact ask: "houses they manage attached to each house to each landlord"). Add a collapsible landlord header listing landlord name + count of houses.

### Read-only data hooks

Extend `useNearbyHouses` is not needed; add:
- `src/hooks/useLandlordOpsHouses.ts` — fetches a landlord's houses with current tenant profile join.
- `src/hooks/useAgentManagedHouses.ts` — fetches agent's houses grouped by landlord with attached tenant profile.

## Out of scope (call out)

- Wallet / ledger movements when swapping tenants — none. The existing rent billing engine continues to bill against `rent_requests`; this change only retargets which house a tenant physically occupies.
- Listing bounty: unaffected — already paid on the first NULL→set transition; subsequent swaps will not re-trigger it (the existing trigger checks `placement_bonus_paid_at IS NULL`).
- Trust signals: the new RPCs will emit `system_events` so the Trust Coverage Engine can attribute behavior; no new score factors.

## Files touched

- New migration (RPCs only, no table changes).
- `src/components/executive/LandlordOpsDashboard.tsx` (wire new dialogs).
- `src/components/executive/landlord-ops/BindTenantToHouseDialog.tsx` (new).
- `src/components/executive/landlord-ops/RemoveTenantDialog.tsx` (new).
- `src/components/agent/AgentListingsSheet.tsx` (group by landlord, add actions).
- `src/components/agent/ReassignTenantAgentDialog.tsx` (new).
- `src/hooks/useLandlordOpsHouses.ts` (new).
- `src/hooks/useAgentManagedHouses.ts` (new).

## Approval

Reply "go" to proceed. The migration will be submitted first; UI changes ship in the same response after you approve it.