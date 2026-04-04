

## Add Verification Step to Sub-Agent Registration Commission

### Current Flow (Problem)
1. Sub-agent registers → row inserted into `agent_subagents`
2. `trg_award_subagent_commission` trigger fires **immediately** on INSERT
3. Parent agent receives UGX 10,000 **without any verification**

### New Flow (Target)
1. Sub-agent registers → row inserted into `agent_subagents` with `status = 'pending'`
2. Agent Ops reviews the registration in a new **Sub-Agent Verification Queue**
3. On verification → status updated to `verified` → trigger fires → UGX 10,000 credited
4. On rejection → status updated to `rejected`, relationship preserved for audit trail

### Implementation

**Step 1: Database Migration**
- Add `status` column to `agent_subagents` (default `'pending'`, values: `pending`, `verified`, `rejected`)
- Add `verified_by` (UUID, nullable) and `verified_at` (timestamptz, nullable) columns
- Add `rejection_reason` (TEXT, nullable) column
- Drop the existing INSERT trigger (`trg_award_subagent_commission`)
- Create a new UPDATE trigger that fires when `status` changes to `'verified'`, calling the same `award_subagent_registration_bonus()` function
- Backfill existing rows to `status = 'verified'` so historical data is consistent

**Step 2: Update Trigger Function**
- Modify `award_subagent_registration_bonus()` to be an UPDATE trigger instead of INSERT
- Add a guard: only fire when `NEW.status = 'verified' AND (OLD.status IS DISTINCT FROM 'verified')`

**Step 3: Add Sub-Agent Verification Queue to Agent Ops Dashboard**
- Create `SubAgentVerificationQueue.tsx` in `src/components/executive/`
- Follow the exact same pattern as `ServiceCentreVerificationQueue.tsx`:
  - Tabs: "Pending" (with red pulse badge) and "Verified" (history)
  - Each pending card shows: sub-agent name, phone, parent agent name, registration date, source
  - Verify button → updates status to `verified`, sets `verified_by` and `verified_at`
  - Reject button → requires 10-char reason, updates status to `rejected`
- Add to `AgentOpsDashboard.tsx` nav grid as "Sub-Agents" with a `UsersRound` icon

**Step 4: Update Agent-Facing UI**
- Update `SubAgentsList.tsx` to show status badges (pending/verified/rejected) on each sub-agent
- Update `CollapsibleSubAgents.tsx` counts to distinguish pending-verification from active

**Step 5: Update Sub-Agent Invite Lists**
- In `SubAgentInvitesList.tsx`, ensure pending invites still show correctly alongside the new verification status

### Files to Change
- **New migration SQL** — add columns, swap trigger from INSERT to UPDATE, backfill
- `src/components/executive/SubAgentVerificationQueue.tsx` — new component
- `src/components/executive/AgentOpsDashboard.tsx` — add nav item + render case
- `src/components/agent/SubAgentsList.tsx` — add status badges
- `src/components/agent/CollapsibleSubAgents.tsx` — update counts if needed

### What Stays the Same
- `credit_agent_event_bonus` RPC — unchanged, still called by the trigger
- `activate-supporter` and `SelectRole.tsx` — still insert into `agent_subagents` (new rows default to `pending`)
- `user-snapshot` edge function — still queries `agent_subagents` (no schema change needed beyond the new columns)

