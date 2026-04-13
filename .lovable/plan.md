

## Plan: Fix Cashout Agent Withdrawal Request Visibility

### Problem
The cashout agent's query filters withdrawal requests by status `['pending', 'requested', 'manager_approved', 'cfo_approved']`, but the database has requests with statuses like `'approved'` and `'fin_ops_approved'` that are also actionable. The RLS policies already grant access — this is purely a filter mismatch.

### Current State
- **5** pending, **1** manager_approved, **32** approved, **2** fin_ops_approved requests exist
- The query misses `approved` and `fin_ops_approved`, so 34 actionable requests are hidden

### Change

**Edit `src/components/agent/AgentCashPayoutsTab.tsx`** (line 48):
- Expand the status filter to include all actionable statuses: `['pending', 'requested', 'manager_approved', 'cfo_approved', 'approved', 'fin_ops_approved']`

### Files to edit
- `src/components/agent/AgentCashPayoutsTab.tsx` — one-line status filter fix

