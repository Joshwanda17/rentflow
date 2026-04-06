

# HR Module Implementation Plan

## Overview

Add an `hr` role to the system with a dedicated HR Dashboard at `/hr/dashboard`. HR governs **internal staff only** (agents, sub-agents, managers, back-office). All actions are event-driven via `system_events` and audited in `audit_logs`. HR prepares but never disburses money — the CFO retains financial authority.

---

## Phase 1: Database Foundation

### 1.1 Add `hr` to the `app_role` enum
```sql
ALTER TYPE public.app_role ADD VALUE 'hr';
```

### 1.2 New tables

**`leave_requests`** — Leave management
- `id`, `employee_id` (FK profiles), `leave_type` (enum: annual, sick, personal, maternity, paternity), `start_date`, `end_date`, `days_count`, `reason` (min 10 chars via trigger), `status` (pending/approved/rejected/cancelled), `reviewed_by` (FK profiles), `reviewed_at`, `review_note`, `created_at`

**`leave_balances`** — Annual entitlements
- `id`, `employee_id` (FK profiles), `leave_type`, `year` (int), `total_days`, `used_days`, `remaining_days`, `created_at`, `updated_at`
- Unique constraint on (employee_id, leave_type, year)

**`disciplinary_records`** — Formal HR actions
- `id`, `employee_id` (FK profiles), `action_type` (enum: verbal_warning, written_warning, suspension, termination, probation), `severity` (low/medium/high/critical), `description` (min 10 chars), `issued_by` (FK profiles), `effective_date`, `expiry_date` (nullable), `status` (active/expired/appealed/overturned), `resolution_note`, `created_at`

**`payroll_batches`** — HR prepares, CFO approves
- `id`, `period_start`, `period_end`, `status` (draft/submitted/approved/rejected/disbursed), `prepared_by` (FK profiles), `approved_by` (FK profiles), `total_amount`, `employee_count`, `notes`, `submitted_at`, `approved_at`, `created_at`

**`payroll_items`** — Line items per batch
- `id`, `batch_id` (FK payroll_batches), `employee_id` (FK profiles), `base_salary`, `deductions` (jsonb), `bonuses` (jsonb), `net_amount`, `notes`

### 1.3 RLS Policies
- `hr` role gets SELECT/INSERT/UPDATE on all HR tables
- `super_admin`, `cto` bypass as usual
- `cfo` gets SELECT on payroll tables (for approval)
- Employees can SELECT their own leave_requests, leave_balances, and disciplinary_records
- All tables have RLS enabled

### 1.4 System event types
Add to `system_event_type` enum:
- `hr_leave_requested`, `hr_leave_approved`, `hr_leave_rejected`
- `hr_disciplinary_issued`, `hr_disciplinary_resolved`
- `hr_payroll_submitted`, `hr_payroll_approved`, `hr_payroll_rejected`
- `hr_employee_onboarded`, `hr_employee_offboarded`
- `hr_role_change_requested`, `hr_role_change_approved`

### 1.5 Triggers
- On `leave_requests` status change → insert `system_events` row + `audit_logs` row
- On `disciplinary_records` insert → emit system event
- On `payroll_batches` status change → emit system event
- On `staff_profiles` soft-delete (if adding `enabled` flag) → emit offboarding event

---

## Phase 2: Edge Functions

### 2.1 `hr-approve-leave`
- Validates caller has `hr` role
- Updates leave_request status
- Decrements leave_balance
- Logs to `audit_logs` with mandatory reason (10+ chars)
- Emits `hr_leave_approved` system event

### 2.2 `hr-submit-payroll`
- HR prepares batch → status = `submitted`
- Emits `hr_payroll_submitted` event
- Notifies CFO via existing notification pattern

### 2.3 `hr-issue-disciplinary`
- Validates caller, inserts record
- Emits system event
- If action_type = `termination` → soft-disables user role via `enabled` flag

---

## Phase 3: Frontend — HR Dashboard

### 3.1 Route & Config
- Add `hr: '/hr/dashboard'` to `roleDashboardRoutes`
- Add `'hr'` to `ISOLATED_ROLES` and `STAFF_ROLES`
- Add `hr` to `AppRole` type in `types.ts`
- Add sidebar config for HR with sections: Overview, Employees, Leave, Payroll, Disciplinary, Audit

### 3.2 HR Dashboard Page (`src/pages/HRDashboard.tsx`)
Mobile-first layout with tabs/sub-views:

**Overview Tab** — KPI cards:
- Total staff count, active leave count, pending payroll, open disciplinary cases
- Recent HR events timeline (from `system_events` WHERE event_type LIKE 'hr_%')

**Employee Directory Tab**:
- List from `staff_profiles` joined with `profiles` and `user_roles`
- Search/filter by department, position, status
- Tap to view detail → role history, leave history, disciplinary history, advance status
- Onboard button → opens existing `RegisterEmployeeDialog` (already built)
- Offboard button → soft-disable with mandatory 10-char reason

**Leave Management Tab**:
- Pending requests queue with approve/reject actions
- Leave balance overview per employee
- Request form (HR can file on behalf of employee)

**Payroll Tab**:
- Create batch → auto-populate from staff_profiles + salary data
- Edit line items (deductions from `agent_advances`, bonuses)
- Submit to CFO → status becomes `submitted`
- View history of past batches and their statuses

**Disciplinary Tab**:
- Issue new action (warning/suspension/termination)
- View active cases, filter by severity
- Resolution workflow with mandatory notes

**Audit Tab**:
- Reuse existing `AuditLogViewer` filtered to HR action types

### 3.3 Role Guard
- Wrap `/hr/*` routes with `RoleGuard allowedRoles={['hr', 'super_admin', 'cto']}`

### 3.4 Staff Portal Update
- Add `'hr'` to `STAFF_ROLES` array in `StaffPortal.tsx`

---

## Phase 4: Integration with Existing Systems

### 4.1 Agent Advances Integration
- HR dashboard reads `agent_advances` to show outstanding balances
- Payroll deductions reference advance repayment amounts
- HR cannot modify advances directly (manager/CFO authority preserved)

### 4.2 Agent Performance Data
- HR reads `agent_collection_streaks`, `agent_earnings`, `agent_goals` for performance reviews
- Read-only — operational authority stays with COO/department heads

### 4.3 Escalations
- HR reads `agent_escalations` to inform disciplinary decisions
- Cross-reference with disciplinary_records for pattern detection

### 4.4 Existing Employee Registration
- The `register-employee` edge function already exists
- HR gets permission to invoke it (add `'hr'` to the allowed caller roles check)

---

## Event-Driven Architecture Compliance

```text
Action                  → System Event              → Audit Log
─────────────────────────────────────────────────────────────────
Leave requested         → hr_leave_requested         → ✓ (10-char reason)
Leave approved/rejected → hr_leave_approved/rejected → ✓
Disciplinary issued     → hr_disciplinary_issued      → ✓
Payroll submitted       → hr_payroll_submitted        → ✓
Payroll approved (CFO)  → hr_payroll_approved          → ✓
Employee onboarded      → hr_employee_onboarded        → ✓
Employee offboarded     → hr_employee_offboarded       → ✓
Role change             → hr_role_change_requested     → ✓
```

Every HR action writes to both `system_events` (source of truth, event-driven) and `audit_logs` (accountability, 10-char minimum reason). Dashboard KPIs read from `system_events` aggregations, never from direct table counts.

---

## Files Created/Modified

| File | Action |
|------|--------|
| Migration SQL | New tables, enum values, triggers, RLS |
| `src/hooks/auth/types.ts` | Add `'hr'` to AppRole |
| `src/components/layout/executiveSidebarConfig.ts` | Add HR sidebar, route, label |
| `src/pages/HRDashboard.tsx` | New — main dashboard |
| `src/components/hr/` | New — HROverview, LeaveManagement, PayrollBatch, DisciplinaryPanel, EmployeeDirectory |
| `src/pages/StaffPortal.tsx` | Add `'hr'` to STAFF_ROLES |
| `supabase/functions/hr-approve-leave/index.ts` | New edge function |
| `supabase/functions/hr-submit-payroll/index.ts` | New edge function |
| `supabase/functions/hr-issue-disciplinary/index.ts` | New edge function |
| `supabase/functions/register-employee/index.ts` | Add `'hr'` to allowed caller roles |
| `src/App.tsx` | Add `/hr/*` routes with RoleGuard |

