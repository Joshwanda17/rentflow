

## Plan: Assign Manager Role to Mukhaye Lydia

**User**: Mukhaye Lydia (`0791645944`) — ID: `b0efbbe6-197d-477c-b8a0-cff02b951724`

**Action**: Insert a `manager` role into `user_roles` table for this user.

```sql
INSERT INTO user_roles (user_id, role, enabled)
VALUES ('b0efbbe6-197d-477c-b8a0-cff02b951724', 'manager', true);
```

This is a single data insert — no schema or code changes required. Lydia will see the Manager dashboard on her next login/session refresh.

