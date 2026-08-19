---
name: Budget cycle open notifications (department-level)
description: Opening a budget cycle creates ONE notice per active hr_departments row (budget_department_notifications), visible in the ops dashboard bell to anyone with that department's dashboard access; per-user read receipts
type: feature
---
When a `budget_calls` row becomes `status='open'`, `budget_notify_cycle_open(call_id)` inserts **one row per active `hr_departments` row** into `budget_department_notifications` (UNIQUE `call_id, department_id`) — no per-user fan-out.

- Visibility authority = **department dashboard access** (`operations_departments.department = hr_departments.key`), via `budget_can_access_department(dept_id, user_id)`. HR assignments are NOT used for notification recipients.
- Read state per user: `budget_department_notification_reads` (`notification_id, user_id`).
- Client: `get_budget_department_notifications()` (cycle title, department name, deadline, message, link `/budgets`, `is_read`) and `mark_budget_department_notification_read(_notification_id)`.
- UI: `BudgetDepartmentNotificationBell` in the Executive Hub header and the Partner Ops top bar; clicking a notice marks it read for that user and navigates to `/budgets`.
- Reopening a cycle never duplicates (ON CONFLICT DO NOTHING on `call_id, department_id`).
- Legacy per-user table `budget_cycle_notifications` remains but is no longer written by cycle-open.
- `budget_user_department_ids` still unions HR assignments and dashboard access (submission rights).
- Routing untouched: tenant_ops/agent_ops/landlord_ops/partner_ops → `pending_coo`; others → `submitted` (direct to CFO). Post-submission `budget_notify` in-app notices unchanged (`type='budget'` allowlisted past `block_all_notification_inserts`).
