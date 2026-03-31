# Secure Staff Access: Event-Based RBAC & Forced Password Change

## Problem

1. Any user with `manager` role can access ALL executive dashboards (CEO, CFO, CTO, etc.) — massive information leak
2. No forced password change on first login — no individual accountability
3. No audit trail for dashboard access or login events

## Phase 1: Database Changes

**Migration 1 — Add `must_change_password` to profiles table**

```sql
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;
```

**Migration 2 — Create `staff_permissions` table**  
Maps which staff users can access which dashboards. Only `super_admin and CTO role` bypasses this.

```sql
CREATE TABLE public.staff_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  permitted_dashboard text NOT NULL,  -- e.g. 'ceo', 'cfo', 'cto', 'financial-ops'
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz DEFAULT now(),
  UNIQUE(user_id, permitted_dashboard)
);
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
-- Staff can read their own permissions
CREATE POLICY "Users read own permissions" ON public.staff_permissions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Admins manage permissions
CREATE POLICY "Admins manage permissions" ON public.staff_permissions
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'manager')
  );
```

## Phase 2: Edge Function — Provision Staff Passwords

`**provision-staff-passwords**` edge function:

- Queries all users with staff roles (manager, ceo, coo, cfo, cto, cmo, crm, employee, operations)
- Sets password to `"WelileManager"` for each using admin API
- Sets `must_change_password = true` on their profile
- Inserts `audit_logs` entry: `staff_password_provisioned` per user
- Returns count of provisioned accounts
- One-time run, callable by super_admin only

## Phase 3: Forced Password Change Interceptor

**New component: `ForcePasswordChange.tsx**`

- Full-screen overlay shown when `profiles.must_change_password === true`
- Requires new password (min 8 chars, must differ from temp)
- On submit: calls `supabase.auth.updateUser({ password })`, sets `must_change_password = false`
- Emits audit event: `staff_password_changed`
- Blocks ALL navigation until password is changed

**Integration point**: Wrap inside `StaffPortal.tsx` login flow and `ExecutiveDashboardLayout.tsx`

## Phase 4: Dashboard Access Gating (The Core Security Fix)

**4a. Remove `manager` from executive RoleGuard routes**

Current (insecure):

```
allowedRoles={['ceo', 'super_admin', 'manager']}
```

New (secure):

```
allowedRoles={['ceo', 'super_admin', 'cto']}
```

Apply to: `/ceo/dashboard`, `/cfo/dashboard`, `/cto/dashboard`, `/coo/dashboard`, `/cmo/dashboard`, `/crm/dashboard`

Only `super_admin, cto` gets blanket access. Individual C-suite roles access only their own dashboard.

**4b. New hook: `useStaffPermissions()**`

- Fetches `staff_permissions` for current user
- Returns `{ permissions: string[], hasPermission: (dashboard: string) => boolean, loading }`
- `super_admin` always returns true for all

**4c. Filter `/admin/dashboard` cards**

- `AdminDashboardPage` uses `useStaffPermissions()` to show only cards the user has explicit permission for
- `super_admin` sees all cards (unchanged)
- `manager` sees only dashboards they've been explicitly granted
- `employee` sees nothing unless granted

**4d. Add permission-based route guard**

- Enhance `RoleGuard` or create `PermissionGuard` that checks `staff_permissions` table in addition to role
- Unauthorized access emits `unauthorized_access_attempt` event to `audit_logs`

## Phase 5: Event-Based Audit Logging

All events go to `audit_logs` table with structured metadata:


| Event                         | Trigger                                     |
| ----------------------------- | ------------------------------------------- |
| `staff_login`                 | Successful staff portal sign-in             |
| `staff_logout`                | Staff sign-out                              |
| `staff_password_changed`      | Password updated after forced change        |
| `staff_password_provisioned`  | Temp password set by admin                  |
| `dashboard_accessed`          | Staff navigates to any executive dashboard  |
| `unauthorized_access_attempt` | Staff tries to access unpermitted dashboard |
| `permission_granted`          | Admin grants dashboard access to staff      |
| `permission_revoked`          | Admin removes dashboard access from staff   |


## Phase 6: Permission Management UI

**In `/admin/users` or `/platform-users**` — add a "Dashboard Permissions" tab/section to the User Details Dialog:

- Checkbox grid of all dashboards (CEO, CFO, CTO, COO, CMO, CRM, Financial Ops, etc.)
- Only `super_admin` and `manager` can grant/revoke
- Each change logged as `permission_granted` / `permission_revoked`

## Files Changed


| File                                                 | Change                                                   |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `supabase/migrations/`                               | 2 migrations (profiles column + staff_permissions table) |
| `supabase/functions/provision-staff-passwords/`      | New edge function                                        |
| `src/components/auth/ForcePasswordChange.tsx`        | New — password change interceptor                        |
| `src/hooks/useStaffPermissions.ts`                   | New — permission check hook                              |
| `src/pages/admin/Dashboard.tsx`                      | Filter cards by permissions                              |
| `src/App.tsx`                                        | Remove `manager` from executive RoleGuard routes         |
| `src/components/auth/RoleGuard.tsx`                  | Add audit event on unauthorized access                   |
| `src/pages/StaffPortal.tsx`                          | Add `staff_login` audit event + force password check     |
| `src/components/layout/ExecutiveDashboardLayout.tsx` | Add `dashboard_accessed` event + force password check    |
| User Details Dialog                                  | Add permissions management grid                          |


## Execution Order

1. Migrations first (profiles column + staff_permissions table)
2. Edge function for password provisioning
3. ForcePasswordChange component
4. useStaffPermissions hook
5. Route guards + admin dashboard filtering
6. Audit events throughout
7. Permission management UI