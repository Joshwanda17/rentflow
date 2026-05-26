## Goal

Add an **Agent filter** dropdown above the tenant list in CFO → Fund Agent Landlord Payout Float, so the CFO can narrow the queue to a single agent's tenants before funding.

## Changes

Edit only `src/components/cfo/RentDisbursementQueue.tsx`:

1. **New state** `agentFilter: string` (default `'all'`).
2. **Build agent options** from the existing `grouped` memo (one entry per agent_id + name, sorted by rent total desc — same order they already render).
3. **Add a `<Select>`** in the toolbar row that currently holds "Select all", placed to its right:
   - Options: `All agents (N)` plus one row per agent showing `Agent name · M tenants · UGX total`.
   - Compact (`h-8 text-xs`), max-width ~260px.
4. **Derive `visibleGroups`** = `grouped` filtered by `agentFilter`.
5. **Render the loop from `visibleGroups`** instead of `grouped`.
6. **Scope "Select all" and the header badge** to the visible subset:
   - `Select all (X of N)` where X = sum of visible rows
   - `allSelected` recomputed against visible items only
   - `toggleAll` toggles only visible items (preserves selection in hidden agents)
7. **Empty filtered state**: if `visibleGroups.length === 0` show a tiny "No tenants for this agent — clear filter" link that resets `agentFilter` to `all`.

No backend, RPC, or query changes — pure client-side filter over already-loaded items.

## Out of scope

- No multi-select agents, no search box (single dropdown is enough for the current scale shown in the screenshot).
- No persistence across sessions.
