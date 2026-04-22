

## Capture geo-location during link / transfer (delink) actions

When an executive **links** an agent to a tenant or **transfers** (delinks) a tenant from one agent to another in `TenantAgentLinker.tsx`, capture the **executive's browser geo-location** at the moment of action and persist it alongside the action's audit record. This gives Tenant Ops a verifiable footprint of *where* every assignment decision was taken — feeding the Agent Field Mandate / Trust Coverage Engine.

### What changes

**1. Capture executive location at click-time**  
- Reuse the existing `useGeoLocation` hook (`src/hooks/useGeoLocation.tsx`) — already returns `{ latitude, longitude, accuracy }` and handles permission errors.
- On **Link** (single request) and on **Confirm transfer** (bulk), call `captureLocation()` *before* invoking the mutation. If the browser denies/timeouts, show a toast and proceed (do **not** block the action — auditability shouldn't break operations), tagging the record with `actor_location_status = 'denied' | 'unavailable' | 'captured'`.
- Add a small inline status row in both the link card footer and the confirm dialog footer:  
  `📍 Location captured (±18 m)` / `📍 Location unavailable — proceeding without geo`.

**2. Also surface tenant & agent last-known location**  
- Both `selectedTenant` and `selectedAgent` already have `id` → query `user_locations` for the most recent row per user (single round-trip via `.in('user_id', [...])` + `order('captured_at', desc)` deduped client-side).
- Show as two pills under each picker:  
  `Tenant last seen: Kampala · 2 h ago` / `Agent last seen: Wakiso · 14 m ago` (or `No location on file`).
- Inside the **confirm dialog**, add a "Location context" block showing tenant + agent last-known coords with a distance estimate (haversine, km) so the operator sees if the new agent is geographically near the tenant.

**3. Persist actor location with the action**

- **Bulk transfer** (`transfer-tenant` edge function): extend the request body with `actor_latitude`, `actor_longitude`, `actor_accuracy`, `actor_location_status`. The function writes them into the new columns on `tenant_transfers` and into the `audit_logs.metadata` JSON. No RLS change needed (table already manager/admin-only).
- **Single link** (direct `rent_requests` update from the client): write a row into `audit_logs` (`action_type='agent_linked'`, `table_name='rent_requests'`, `record_id=rentRequestId`, `metadata={ tenant_id, agent_id, actor_latitude, actor_longitude, actor_accuracy, actor_location_status, reason: 'manual_link' }`) so single-link actions are equally traceable.

**4. Database migration**

Add columns to `tenant_transfers`:
```sql
ALTER TABLE public.tenant_transfers
  ADD COLUMN actor_latitude double precision,
  ADD COLUMN actor_longitude double precision,
  ADD COLUMN actor_accuracy double precision,
  ADD COLUMN actor_location_status text
    CHECK (actor_location_status IN ('captured','denied','unavailable','timeout','unsupported'));
```
No new table — `user_locations` already stores tenant/agent passive captures; this just enriches the action record.

### Files to change

- **New migration** — add 4 actor location columns to `tenant_transfers`.
- `supabase/functions/transfer-tenant/index.ts` — accept and persist `actor_latitude/longitude/accuracy/location_status` to `tenant_transfers` and `audit_logs.metadata`.
- `src/components/executive/TenantAgentLinker.tsx`:
  - Import & use `useGeoLocation`.
  - New query `lastKnownLocations` for `[selectedTenant.id, selectedAgent.id]` against `user_locations`.
  - `linkMutation` and `transferAllMutation` capture location first, pass it through, and `linkMutation` also writes an `audit_logs` row.
  - Render last-seen pills under each picker.
  - Render location-context block + capture status in the confirm dialog.
- (Optional, no code) leverages existing `useGeoLocation` — no new hook required.

### Behavior notes

- **Non-blocking**: a denied/failed geo capture still allows the link/transfer (with `actor_location_status` reflecting why). This matches existing `useLocationTracking` pattern where failures are recorded, never thrown.
- **Single permission prompt per session**: `getCurrentPosition` reuses browser cache (`maximumAge: 0` in current hook — we'll keep it for accuracy at decision-time).
- **Trust mission alignment**: every link/transfer becomes a `system_event`-eligible signal; the geo-stamped `audit_logs.metadata` is the canonical record for downstream `capture_trust_signal` calls if/when wired.

