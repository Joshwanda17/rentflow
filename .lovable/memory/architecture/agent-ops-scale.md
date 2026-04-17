---
name: Agent Ops 1M+ Scale Architecture
description: Server-side aggregation + paginated RPC for Agent Ops dashboard supporting 1M+ agents
type: feature
---
The Agent Ops dashboard is built for 1,000,000+ agents using two server-side RPCs that NEVER transfer all rows to the client:

- `get_agent_ops_totals()` — single SQL aggregate over `user_roles` JOIN `wallets` returning count, total withdrawable/float/advance/held, and bucket-presence counts. Always reflects ALL agents.
- `get_agent_ops_balances(_search, _sort, _limit, _offset)` — paginated/sortable/searchable rows joined with `profiles` + `wallets`. Returns `total_matched` per row for client pagination. Limit clamped to 200, sort whitelist: total/withdrawable/float/advance/name.

The `agent-ops-balances` edge function calls both in parallel, validates auth + permissions (manager/coo/super_admin/cto roles OR `staff_permissions.permitted_dashboard IN agent/agent-ops/agent_ops`), and returns `{ rows, totals, totalMatched, limit, offset }`.

Client (`AgentBalancesPanel.tsx`) uses 50/page, 300ms debounced search, server-side sort, and `keepPreviousData` for smooth pagination. Totals cards always show platform-wide aggregates regardless of current page.

**Why:** Previous batch-loading approach hit URL length / memory limits past ~1000 agents. Server-side SQL aggregation scales linearly with indexes and never sends the full agent set over the wire.
