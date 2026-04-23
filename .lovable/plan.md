

## Plan: Add a "Sub Agents" tab on the Agent dashboard

Add a fifth tab to the Agent Hub tab bar that lists all of the agent's sub-agents, each tagged to the parent agent (the signed-in agent), with their tenant counts visible.

### What changes

#### 1) Tab bar update — `src/components/agent/AgentHubTabs.tsx`
- Extend `AgentHubTab` union: `'home' | 'money' | 'tenants' | 'grow' | 'subagents'`.
- Add a new tab entry after **Grow**:
  - id: `subagents`
  - icon: `UsersRound` (lucide)
  - label: `Sub Agents`
- Update the grid from `grid-cols-4` to `grid-cols-5` so all five tabs fit on mobile, with tighter padding/icon sizes already used.

#### 2) Agent dashboard panel — `src/components/dashboards/AgentDashboard.tsx`
- Add a new conditional block after the existing `activeTab === 'grow'` panel:
  ```tsx
  {activeTab === 'subagents' && (
    <div className="space-y-5 animate-in fade-in duration-200">
      <SubAgentsPanel agentId={user.id} />
    </div>
  )}
  ```
- Import the new panel component.

#### 3) New panel — `src/components/agent/SubAgentsPanel.tsx`
Reuse existing data plumbing (we already have `SubAgentsList` and `SubAgentInvitesList` that do the heavy lifting). The panel will:

- Header strip showing:
  - Parent agent name + avatar (the signed-in agent) with a "Lead Agent" badge so the parent-child tagging is visible
  - Total sub-agents
  - Total tenants across all sub-agents
- Pending invites section (`SubAgentInvitesList`) — only renders if invites exist
- Active sub-agents section (`SubAgentsList`) — already shows per-sub-agent tenant counts and earnings
- Empty state: when zero sub-agents and zero invites, show a friendly card with an "Invite Sub-Agent" CTA that triggers the existing invite flow (uses the `handleInviteSubAgent` handler already wired in `AgentDashboard`)

Tagging-to-parent visualization:
- Each sub-agent row keeps the existing layout but adds a small subtitle line: `Reports to: {parent agent full name}` so the link to the lead agent is explicit on screen.
- Total tenants is derived by summing `tenants_count` across the sub-agents already loaded by `SubAgentsList`. We will lift that aggregate up through a small callback prop `onSummary({ count, totalTenants })` so the header can render the total without duplicating the query.

#### 4) Minor enhancement — `src/components/agent/SubAgentsList.tsx`
- Add an optional `onSummary?: (s: { count: number; totalTenants: number; totalEarnings: number }) => void` prop and call it after the enrichment step.
- Add an optional `parentAgentName?: string` prop. When provided, render the "Reports to: …" subtitle under each sub-agent name.
- No behavior change when these props are omitted (existing usages stay intact).

### ASCII layout

```text
[ Home ] [ Money ] [ Tenants ] [ Grow ] [ Sub Agents* ]

Sub Agents tab:
┌─────────────────────────────────────────────┐
│  Lead Agent: Grace Paul Ochieng             │
│  Sub-Agents: 4    Total Tenants: 37         │
└─────────────────────────────────────────────┘
[ Pending Invites (if any) ]
[ My Sub-Agents list                          ]
   • Name — 12 tenants — Reports to: Grace P. │
```

### Files to change

- `src/components/agent/AgentHubTabs.tsx` (add `subagents` tab, switch to 5-col grid)
- `src/components/dashboards/AgentDashboard.tsx` (render the new panel)
- `src/components/agent/SubAgentsList.tsx` (optional `onSummary` + `parentAgentName` props)
- `src/components/agent/SubAgentsPanel.tsx` (new file)

### Notes

- No backend / RLS changes needed — the data comes from the existing `agent_subagents`, `referrals`, `profiles`, `agent_earnings`, and `rent_requests` queries already used by `SubAgentsList`.
- Tenant counts already exist per-sub-agent; the new total is just a client-side sum.
- Empty state CTA reuses the existing invite-sub-agent handler in `AgentDashboard`, so no new invite flow is introduced.

