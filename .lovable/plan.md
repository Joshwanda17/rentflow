

## Tenant Replacement (Eviction) — Plan

### Current state
- `landlords` is the **property** record (one row = one property+landlord), with a `tenant_id` field pointing at the **current** occupant.
- `rent_requests` is the implicit **tenancy** — each row represents one tenant's rent plan against a landlord/property and carries the financial history (`amount_repaid`, `total_repayment`, `daily_repayment`, status: `pending → … → repaying → completed`).
- `house_listings` mirrors `landlord_id` + `tenant_id`.
- `tenant_replacements` table **already exists** (`old_tenant_id`, `new_tenant_id`, `landlord_id`, `rent_request_id`, `outstanding_balance`, `reason`, `replaced_by`) — but no UI uses it.
- `profiles` has no `status` column for tenants.

### Design (matches the spec, minimal new schema)

**Treat `rent_requests` as the "Tenancy/Lease" record.** It already has property (via `landlord_id`), tenant (`tenant_id`), start (`disbursed_at`/`created_at`), amount, balance, status. We just need an `evicted` / `terminated` terminal status + an end date, then a fresh `rent_requests` row for the new tenant.

#### 1. Schema migration (small, additive)
- `rent_requests`: add `tenancy_status text` (`active` | `evicted` | `terminated` | `completed`), `tenancy_ended_at timestamptz`, `tenancy_end_reason text`, `outstanding_at_end numeric`. Default `active`. **Status values are tenancy lifecycle — separate from existing financial `status` column.**
- `profiles`: add `tenant_status text default 'active'` (`active` | `evicted` | `inactive`) + `evicted_at`, `evicted_from_landlord_id`. Used to flag (not delete) the old tenant identity.
- New `is_tenant_locked()` helper used in an RLS policy to **block UPDATE on key profile fields** (full_name, national_id, phone) once `tenant_status = 'evicted'` — preserves identity.
- `tenant_replacements`: add `effective_at timestamptz`, `new_rent_request_id uuid`, `evicted_by_role text`. Keep existing columns.

#### 2. Atomic RPC `replace_tenant_at_property(p_old_rent_request_id, p_new_tenant_id, p_reason, p_effective_at)`
SECURITY DEFINER, role-gated (`landlord`, `agent`, `landlord_ops`, `coo`, `manager`):
1. Lock old `rent_requests` row, snapshot `outstanding = total_repayment - amount_repaid`.
2. Set `tenancy_status='evicted'`, `tenancy_ended_at=p_effective_at`, `outstanding_at_end=outstanding`. **Old debt stays on old tenant** — never moved.
3. Set `profiles.tenant_status='evicted'` for old tenant + lock fields.
4. Update `landlords.tenant_id` → new tenant; update `landlords.is_occupied=true`; sync `house_listings.tenant_id`.
5. Insert NEW `rent_requests` row (cloning landlord/property/rent/duration; `amount_repaid=0`, `tenancy_status='active'`, `status='pending'`) — new tenant starts fresh, zero inherited balance.
6. Insert into `tenant_replacements` (linking old + new rent_request_id, reason ≥10 chars).
7. Insert `audit_logs` row (mandatory ≥10-char reason).
8. Emit `system_events` `tenant_replaced`.
9. Notify: old tenant ("tenancy ended"), new tenant ("welcome"), landlord, agent.

Validation: reason ≥10 chars, new tenant ≠ old tenant, new tenant exists, caller has access to that landlord/property.

#### 3. Edge function `replace-tenant`
Thin wrapper that auth-checks the caller and calls the RPC. Uses `adminClient.auth.getUser(token)`, manual `corsHeaders`, no `cors` package import (per Edge Function constraints).

#### 4. UI — three small additions
- **Landlord dashboard → tenant card** and **Agent "My Tenants"**: add an "End Tenancy / Replace Tenant" action (icon `UserX`). Opens `ReplaceTenantDialog`:
  - Step 1: confirm eviction, capture **reason** (required, ≥10 chars), eviction date (default today), shows outstanding balance read-only.
  - Step 2: pick new tenant — search existing profile by phone/National ID **or** "Register new tenant" inline (reuses `LandlordAddTenantDialog` snippet).
  - Step 3: review & submit → calls the edge function.
- **Property history view** — new `PropertyTenancyTimeline.tsx` (used in landlord property detail and Landlord Ops): vertical timeline of `rent_requests` for that `landlord_id` ordered by `created_at`, each row showing tenant name, start, end, status badge (Active / Evicted / Completed), total paid, outstanding-at-end, eviction reason. Click → drills into that tenant's payment history (existing `tenant_merchant_payments` filtered by `rent_request_id`).
- **Old tenant profile**: read-only banner "This tenant is marked Evicted as of <date> — record locked for audit" so staff can't accidentally mutate identity fields. Edit forms (`EditTenantDialog`) early-return when `tenant_status === 'evicted'`.

#### 5. Reporting (free, derived)
Per-property tenancy timeline, per-tenant financial history (already isolated by `rent_request_id` everywhere — no migration needed for payments since each `tenant_merchant_payments` row is already tied to `tenant_id` + `rent_request_id`).

### Files

**New**
- `supabase/migrations/<ts>_tenancy_lifecycle.sql` — schema + `replace_tenant_at_property` RPC + RLS lock function.
- `supabase/functions/replace-tenant/index.ts`
- `src/components/tenant-replacement/ReplaceTenantDialog.tsx`
- `src/components/tenant-replacement/PropertyTenancyTimeline.tsx`

**Modified**
- `src/components/agent/EditTenantDialog.tsx` — block edits when `tenant_status='evicted'`.
- `src/components/landlord/LandlordMenuDrawer.tsx` and `src/components/agent/AgentMenuDrawer.tsx` — entry point on the tenant row.
- `src/components/executive/LandlordOpsDashboard.tsx` — surface "Evicted Tenancies" filter + timeline link.

### Out of scope
- No changes to ledger / wallet / debt logic. Old tenant's outstanding balance simply stays on their `rent_requests` row and continues to show in their existing debt views — already supported by `debt-repayment-automation`.
- No bulk-eviction tool.
- No changes to `disburse-rent-to-landlord` (landlord keeps receiving rent via the new tenancy seamlessly).

### Safeguards (per spec)
- Identity fields locked via RLS once evicted ✓
- Mandatory `tenancy_status='evicted'` set BEFORE landlord re-assignment (single atomic RPC) ✓
- `audit_logs` + `system_events` + `tenant_replacements` triple-write per replacement ✓
- New tenant always gets a fresh `rent_requests` row → zero inherited balance ✓
- Old tenant's payment history remains queryable by `tenant_id` + old `rent_request_id` ✓

### Expected outcome
Landlord (or agent/Landlord Ops) opens the property → "End Tenancy" → captures reason + new tenant → one click later: old tenancy is sealed (with debt intact on the old tenant), property points at the new tenant, new rent plan starts at zero, full timeline preserved, all changes auditable.

