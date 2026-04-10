

# Fix: Agent Directory Returns 0 Agents for Executive Users

## Problem
The `user_roles` table has an RLS SELECT policy that only allows a user to see their own role OR users with the `manager` role. Executive roles (`super_admin`, `cto`, `ceo`, `coo`, `cfo`, `cmo`, `crm`) are blocked from querying other users' roles.

Since the Agent Directory calls `fetchAllAgentIds()` which queries `user_roles WHERE role = 'agent'`, it returns 0 rows for any non-manager executive — causing the "Loading agents..." / empty state.

## Fix — One Database Migration

Update the RLS SELECT policy on `user_roles` to also allow executive roles:

```sql
DROP POLICY "Users can view own role" ON public.user_roles;

CREATE POLICY "Users can view roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'manager')
  OR has_role(auth.uid(), 'super_admin')
  OR has_role(auth.uid(), 'cto')
  OR has_role(auth.uid(), 'ceo')
  OR has_role(auth.uid(), 'coo')
  OR has_role(auth.uid(), 'cfo')
  OR has_role(auth.uid(), 'cmo')
  OR has_role(auth.uid(), 'crm')
);
```

## Impact
- Instantly fixes Agent Directory for all executive users
- No frontend code changes needed
- Existing manager access is preserved

## Risk
Minimal — this only broadens read access for trusted executive roles that already have dashboard access gated by `useStaffPermissions`.

