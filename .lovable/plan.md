

# Remove All Proxy Partner Assignments for LUKODDA JOSEPH

## Current State

LUKODDA JOSEPH (`b4d7c324-1f7e-4e1c-91a8-3f0e10e0b25c`) has **28 proxy assignments**:
- **17 approved & active** (these show in Proxy Partners tab with incorrect balances)
- **7 rejected & inactive** (already dead, no action needed)
- **1 pending** (duplicate of ATUHAIRE CAROLYNE)
- **3 others** (Jane Precious, chelangat Sarah princess, SIISA JESSE JOEL, MONDO EMMANUEL COLLINS — newer additions)

## What We'll Do

**Deactivate all 28 assignments** by setting `is_active = false` and `approval_status = 'rejected'` with a rejection reason. This effectively removes them from the Proxy Partners tab and all payout routing.

The agent can then re-submit partner requests through the proper flow, and Partner Operations can re-approve them cleanly.

### Data Operation (via insert tool — UPDATE)

```sql
UPDATE proxy_agent_assignments
SET is_active = false,
    approval_status = 'rejected',
    rejection_reason = 'Clean slate reset: deactivated for re-approval through proper pipeline'
WHERE agent_id = 'b4d7c324-1f7e-4e1c-91a8-3f0e10e0b25c';
```

Also remove the unique constraint conflict for re-submission:

```sql
DELETE FROM proxy_agent_assignments
WHERE agent_id = 'b4d7c324-1f7e-4e1c-91a8-3f0e10e0b25c';
```

**Wait** — there's a UNIQUE constraint on `(agent_id, beneficiary_id)`. If we only deactivate, the agent can't re-submit the same partner. So we need to **delete** the rows entirely so they can be re-created fresh.

### Revised Approach

**Delete all 28 proxy_agent_assignments** for this agent, then insert one audit log entry recording the action.

```sql
-- 1. Delete all assignments
DELETE FROM proxy_agent_assignments
WHERE agent_id = 'b4d7c324-1f7e-4e1c-91a8-3f0e10e0b25c';

-- 2. Audit log
INSERT INTO audit_logs (user_id, action_type, table_name, metadata)
VALUES (
  'b4d7c324-1f7e-4e1c-91a8-3f0e10e0b25c',
  'bulk_delete_proxy_assignments',
  'proxy_agent_assignments',
  '{"reason": "Clean slate: removed all 28 proxy partner assignments for re-approval", "agent": "LUKODDA JOSEPH", "count": 28}'
);
```

### No Code Changes Needed

The `ProxyPartnerFunds.tsx` already filters for `approval_status = 'approved'` and `is_active = true`. Once assignments are deleted, the tab will show empty — exactly what you want.

## Result

- Proxy Partners tab for LUKODDA JOSEPH: **empty**
- Agent re-submits partners through the normal flow
- Partner Operations re-approves each one
- Only future approved payouts will build balances
- Full audit trail of the reset

## Files Changed

| Target | Change |
|--------|--------|
| `proxy_agent_assignments` table | DELETE all 28 rows for this agent |
| `audit_logs` table | INSERT 1 record documenting the bulk reset |

