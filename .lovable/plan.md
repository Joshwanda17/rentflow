

## Plan: Agent Ops Pipeline — Multi-Tab Hub

### Problem
The "Pipeline" button in Agent Ops currently only shows `RentPipelineQueue` filtered to `tenant_ops_approved`. It should show a comprehensive view of everything in the agent pipeline across four categories.

### Solution
Create a new `AgentOpsPipelineHub` component with tabbed navigation showing:

1. **Tenants in Pipeline** — Existing `RentPipelineQueue` (all stages, not just `tenant_ops_approved`)
2. **Sub-Agents in Pipeline** — Existing `SubAgentVerificationQueue` (pending/verified sub-agents)
3. **Promissory Notes** — Existing `PromissoryNotesQueue` (notes posted by agents)
4. **Landlords in Pipeline** — Landlords linked to in-progress rent requests (from `rent_requests` joined with `landlords`)

### Implementation

**New file: `src/components/executive/AgentOpsPipelineHub.tsx`**
- Horizontal scrollable tab bar with 4 tabs + count badges
- Each tab renders the appropriate existing component
- For "Landlords in Pipeline": a new lightweight list querying `rent_requests` where status is not `funded`/`rejected`, grouped by landlord with their linked rent request counts

**Edit: `src/components/executive/AgentOpsDashboard.tsx`**
- Line 148: Change `case 'pipeline'` from rendering `<RentPipelineQueue stage="tenant_ops_approved" />` to `<AgentOpsPipelineHub />`

### Files
| File | Action |
|------|--------|
| `src/components/executive/AgentOpsPipelineHub.tsx` | **Create** — tabbed hub wrapping existing components |
| `src/components/executive/AgentOpsDashboard.tsx` | **Edit** — swap pipeline render to new hub |

