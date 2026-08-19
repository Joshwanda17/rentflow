---
name: Budget cycle open notifications
description: Opening a budget cycle notifies users with department dashboard access; dedup via budget_cycle_notifications; 'budget' type allowed past the notification suppression trigger
type: feature
---
When a `budget_calls` row becomes `status='open'` (insert via `budget_create_cycle` or a status update), `budget_notify_cycle_open(call_id)` fans out one in-app `notifications` row (type `budget`) per eligible user per active `hr_departments` row.

- Recipients come from **department dashboard access**: `operations_departments.department = hr_departments.key` (`budget_department_access_user_ids`). HR assignments are NOT the notification authority.
- `budget_user_department_ids` now unions HR assignments **and** dashboard access, so dashboard access also grants the right to prepare/submit that department's budget.
- Dedup: table `budget_cycle_notifications` (UNIQUE call_id + department_id + user_id) — reopening a cycle or re-saving its status never re-notifies.
- Trigger: `trg_budget_notify_cycle_open` on `budget_calls` (AFTER INSERT OR UPDATE OF status).
- Message carries cycle name, department name, deadline (EAT) and metadata `link: '/budgets'`, `kind: 'budget_cycle_open'`.
- `block_all_notification_inserts` (lean-DB suppression) allowlists type `budget`; without that entry ALL budget notifications — including post-submission COO/CFO ones — are silently dropped.
- Routing untouched: tenant_ops/agent_ops/landlord_ops/partner_ops → `pending_coo`, others → `submitted` (direct to CFO).
