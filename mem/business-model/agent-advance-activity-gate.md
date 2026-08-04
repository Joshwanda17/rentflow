---
name: Agent advance activity gate
description: Zero-activity agents cannot request an advance; at least one field-work signal required (sub-agent, rent request, collection, promissory note, verified house)
type: feature
---
An agent may only submit an `agent_advance_requests` row if they have at least ONE
recorded piece of field work. Signals (any one is enough):

- recruited sub-agent (`agent_subagents`, status active/verified or accepted_at set)
- rent request raised for a tenant (`rent_requests.agent_id`, tenant_id set, agent <> tenant)
- rent collected (`agent_collections`)
- activated/approved promissory note (`promissory_notes`)
- house they listed that got verified (`house_listings.verified_at` not null, status <> rejected)

Enforcement:
- `public.agent_advance_activity(uuid)` → jsonb snapshot with per-signal counts, `signals`, `eligible`.
- Trigger `zz_enforce_agent_advance_activity` (BEFORE INSERT on `agent_advance_requests`) raises `ADVANCE_NO_ACTIVITY: ...`.
- UI: `useAgentAdvanceActivity` + `AdvanceActivityGateCard` replace the "Request a new advance" button with an unlock checklist.

Limit structure (agents, `recalculate_credit_limit`): base UGX 20,000; sub-agents
(+30,000 active / +9,000 registered, cap 3M); rent collected 6% of lifetime (cap 2.4M);
rent requests +9,000 each (cap 1.5M); activated promissory notes +9,000 each (cap 600K);
hard cap UGX 9,000,000. House-listing, ratings, receipts and landlord-rent bonuses are
retired for agents.
