## Goal

Force every agent to capture a precise location for each person they onboard or manage (tenants, landlords, partners, sub-agents). No agent-side workflow can complete without it.

## Scope

Applies to all agent-initiated creation/edit flows for:
- Tenants (rent collection setup, tenant onboarding, allocation)
- Landlords (landlord registration via agent)
- Partners (proxy partner registration)
- Sub-agents (agent-registered agents)

Out of scope: end-user self-onboarding (already covered by ProfileCompletionGate).

## What gets captured

Reuse the same hybrid address structure already added in `ProfileCompletionGate`:

- Continent, Country, Region, District, City/Town, Ward, Cell/Village (dropdowns for Uganda, free-text elsewhere)
- GPS coordinates (auto-captured via `navigator.geolocation`, required, with manual "pin on map" fallback)
- Free-text landmark / nearest known place (required)

GPS is mandatory because this is an agent field action — aligns with the **AGENT FIELD MANDATE** (every agent workflow writes geo + AI ID to `agent_visits`).

## Behavior

1. **New record**: Agent cannot submit the create form until address block + GPS are filled.
2. **Existing record without location**: When an agent opens any managed contact (tenant/landlord/partner/sub-agent) that is missing location data, a blocking modal `AgentContactLocationGate` appears. Cannot dismiss, cannot proceed to collect rent / pay out / allocate float until saved.
3. On save:
   - Update target's `profiles` address columns.
   - Insert a row into `agent_visits` (`visit_type='location_capture'`, with GPS + AI ID + target user_id) — satisfies trust-signal mandate.
   - Call `capture_trust_signal` RPC to bump the contact's Welile Trust Score (verification+GPS factor).
   - Emit `system_event` `agent.contact_location_captured`.

## Technical Plan

### 1. Shared component
`src/components/agent/AgentContactLocationGate.tsx`
- Reuses the address form pieces from `ProfileCompletionGate` (extract into `src/components/shared/AddressFormFields.tsx` so both gates share one source of truth).
- Props: `targetUserId`, `targetRole`, `open`, `onComplete`.
- GPS capture with retry + manual fallback.
- Calls `agent-capture-contact-location` edge function.

### 2. Edge function
`supabase/functions/agent-capture-contact-location/index.ts`
- Auth: `adminClient.auth.getUser(token)`, manual `corsHeaders`.
- Validates agent role, validates target relationship (agent must own/manage target).
- Updates `profiles` address columns.
- Inserts `agent_visits` row with geo + agent AI ID.
- Calls `capture_trust_signal` RPC.
- Emits `system_event`.

### 3. Wire-in points (gate triggers)
Add a guard hook `useRequireContactLocation(targetUserId)` that returns `{ blocked, GateComponent }`. Mount it in:
- `AgentTenantCollectDialog` (block Confirm until target tenant has address+GPS)
- Tenant profile sheet `TenantProfileView` (block all action buttons)
- Landlord-by-agent flows (rent_request landlord card)
- Proxy partner registration / partner detail (agent view)
- Sub-agent invite / sub-agent detail

### 4. Schema
Likely additive only — `profiles` already has address fields from previous migration. New columns needed:
- `profiles.location_captured_by_agent_id uuid`
- `profiles.location_captured_at timestamptz`
- `profiles.location_gps_lat numeric`, `location_gps_lng numeric`, `location_gps_accuracy_m numeric`

(Confirm during build that these don't already exist; migration only adds missing ones.)

### 5. RLS
- Agents can UPDATE address columns on `profiles` rows where they have an active managing relationship (tenant assigned to them, landlord linked via `rent_requests`, proxy partner link, sub-agent parent_agent_id). New `has_agent_relationship(_agent_id, _target_id)` SECURITY DEFINER function for the policy.

### 6. UI/UX
- Modal title: "Capture {role} location" — non-dismissible.
- Sticky "Use my current location" button at top.
- Inline validation, single Save action.
- After save: success toast + auto-close + re-runs the original action.

## Open questions (will confirm during build, not blocking the plan)

- Whether existing `profiles` already has the GPS columns from the prior ProfileCompletionGate migration — if yes, skip those.
- Exact list of "managed" relationships for sub-agents (need to confirm sub-agent table name).
