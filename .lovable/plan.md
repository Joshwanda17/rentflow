

# Fix: Rename Pending Invite "User 1224" to "GINA"

## Problem
Phone `0750521224` has a pending invite record in `supporter_invites` with `full_name = 'User 1224'` instead of **GINA**.

## Fix
Single database migration to update the name:

```sql
UPDATE supporter_invites
SET full_name = 'GINA'
WHERE id = '508696e0-6bca-47bf-bc24-d5c72f1f8ca7';
```

## No frontend changes needed
The invite list already reads `full_name` from `supporter_invites` — it will display "GINA" immediately after the update.

