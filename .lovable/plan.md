

# Shareable Tenant Registration Form

## Overview
Build a public-facing tenant registration form that agents can share via link. When a tenant fills it out, the submission is tied to the agent, creating a tenant record in `supporter_invites` (which already has all needed columns). The form lives at `/register-tenant?agent={agentId}&token={token}` — no login required.

## Architecture

```text
Agent Dashboard                    Public Form Page
┌──────────────┐     share link    ┌────────────────────┐
│ "Share Tenant │  ─────────────►  │ /register-tenant   │
│  Form" button │                  │ ?agent=xxx&token=yy │
└──────────────┘                  │                    │
                                   │ Full Name           │
                                   │ Phone               │
                                   │ National ID         │
                                   │ Property Address    │
                                   │ Rent Amount         │
                                   │ [Submit]            │
                                   │                    │
                                   │ Shared by: Agent X  │
                                   │ Phone: +256...      │
                                   └────────────────────┘
                                          │
                                          ▼
                                   Edge Function:
                                   submit-tenant-form
                                   ─ validate token
                                   ─ validate fields
                                   ─ insert supporter_invites
                                     (role='tenant', status='pending')
                                   ─ create auth user via register-tenant
```

## Changes

### 1. Database: `agent_form_tokens` table (migration)
Stores shareable tokens per agent with expiry and usage tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| agent_id | uuid | FK profiles, NOT NULL |
| token | text | unique, NOT NULL |
| expires_at | timestamptz | default now() + 72 hours |
| max_uses | int | default 50 |
| uses_count | int | default 0 |
| is_active | boolean | default true |
| created_at | timestamptz | default now() |

RLS: agents can SELECT/INSERT their own tokens. Public can SELECT (for validation in edge function, but edge function uses service role anyway).

### 2. Edge Function: `submit-tenant-form`
New edge function (`supabase/functions/submit-tenant-form/index.ts`):
- **No auth required** (public endpoint)
- Validates token exists, not expired, not exceeded max uses
- Validates form fields (full_name, phone, national_id, rent_amount, property_address)
- Looks up agent profile for the footer data return
- Calls existing `register-tenant` logic internally (create auth user + profile)
- Inserts into `supporter_invites` with `role='tenant'`, `source='shared_form'`, `created_by=agent_id`
- Increments `uses_count` on the token
- Returns success with tenant ID

### 3. New Page: `src/pages/RegisterTenantPublic.tsx`
Public page at `/register-tenant` route:
- Reads `agent` and `token` from URL params
- Fetches agent name/phone from a lightweight edge function call (or embed in token validation response)
- Shows branded form: Full Name, Phone, National ID, Rent Amount, Property/Unit Address
- Footer: "This form was shared by: **Agent Name** · Phone: +256..."
- Submit calls `submit-tenant-form` edge function
- Success screen with confirmation
- Welile branding throughout

### 4. Agent Dashboard: "Share Tenant Form" button
In `AgentDashboard.tsx` and/or `AgentMenuDrawer`:
- Add "Share Tenant Form" action
- On click: calls edge function to generate token → builds URL → triggers native share or clipboard copy
- Pattern matches existing funder/sub-agent share link flow

### 5. Edge Function: `generate-tenant-form-token`
Lightweight function:
- Requires auth (agent must be logged in)
- Creates row in `agent_form_tokens`
- Returns the shareable URL

### 6. Route Registration
Add `<Route path="/register-tenant" element={<RegisterTenantPublic />} />` in `App.tsx` (public, no RoleGuard).

### 7. Visibility in Tenant Ops
Submissions via shared form already land in `supporter_invites` with `role='tenant'` and `status='pending'`, which existing tenant operations flows can pick up. The `source` metadata distinguishes shared-form submissions from agent-direct registrations.

## Files Changed
1. **Migration** — create `agent_form_tokens` table with RLS
2. `supabase/functions/generate-tenant-form-token/index.ts` — token generation (auth required)
3. `supabase/functions/submit-tenant-form/index.ts` — public form submission handler
4. `src/pages/RegisterTenantPublic.tsx` — public tenant registration form page
5. `src/App.tsx` — add `/register-tenant` route
6. `src/components/dashboards/AgentDashboard.tsx` — add share button + state
7. `src/components/agent/AgentMenuDrawer.tsx` — add "Share Tenant Form" menu item

