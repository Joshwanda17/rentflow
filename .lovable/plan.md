## Goal
On the agent **Tenants** tab ("My Tenants"), show the **Submissions** pipeline stacked directly above the existing tenant list — no toggle, both visible by scrolling.

## Current behavior
- `src/components/dashboards/AgentDashboard.tsx` → `activeTab === 'tenants'` renders: header ("My Tenants" + Add Tenant), `AgentDailyCardEmailPrompt`, `AgentCapacityShareInline`, then `AgentTenantInlineList`.
- The Submissions pipeline (`AgentRequestPipelineView`: submitted / approved / rejected / landlords) currently only opens inside the full-screen `AgentTenantsSheet`.

## Changes (frontend only)

In `src/components/dashboards/AgentDashboard.tsx`, inside the `activeTab === 'tenants'` block:

1. Add a **"Submissions"** section directly under the header (above `AgentTenantInlineList`):
   - A small section heading ("Submissions") so the two areas read as distinct.
   - Render `<AgentRequestPipelineView initialTab="submitted" />` inline.
2. Keep the existing **"My Tenants"** list below it (add a matching "My Tenants" sub-heading above `AgentTenantInlineList` so the stacked layout is clearly labelled).
3. Import `AgentRequestPipelineView` from `@/components/agent/AgentRequestPipelineView` at the top of the file.

The existing `AgentTenantsSheet` (and its pipeline view, deep-link events, highlight handling) stays untouched as a fallback / detail surface.

```text
Tenants tab
├─ Header: "My Tenants"  [Add Tenant]
├─ AgentDailyCardEmailPrompt
├─ AgentCapacityShareInline
├─ "Submissions"  ← new heading
│   └─ AgentRequestPipelineView (submitted/approved/rejected/landlords)
└─ "My Tenants"   ← new sub-heading
    └─ AgentTenantInlineList
```

## Technical notes
- `AgentRequestPipelineView` is self-contained (fetches its own data via React Query, has its own search/sort/tabs and detail drawer), so it embeds cleanly with no new props or backend work.
- Pure presentation/layout change in one file plus one import — no business logic, RPC, or schema changes.

## Verification
- Build/typecheck passes.
- On the Tenants tab, the Submissions pipeline appears first, the tenant list below; both scroll within the tab.
