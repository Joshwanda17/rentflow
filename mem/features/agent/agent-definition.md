---
name: Agent Definition (Agent Ops Dashboard)
description: Behavior-based (not role-based) definition of who counts as an Agent, with total→agents→active funnel
type: feature
---
For the Agent Ops Dashboard, an "agent" is defined by ACTIVITY, not the `user_roles` role='agent' (which is auto-assigned to ~everyone and is meaningless here). A user counts as an agent if they meet at least ONE of:
1. Listed ≥1 house (`house_listings.agent_id`)
2. Posted ≥1 promissory note (`promissory_notes.agent_id`)
3. Made ≥1 rent request on behalf of a tenant (`rent_requests` where `agent_id IS NOT NULL AND agent_id <> tenant_id` — excludes a user's own rent request)
4. Added ≥1 sub-agent directly (`agent_subagents.parent_agent_id`) OR via referral (`referrals.referrer_id`/`profiles.referrer_id`), WHERE the added/referred person themselves qualifies as an agent (RECURSIVE — transitive closure up the referral/sub-agent graph).

Computed by RPC `get_agent_ops_agent_stats(p_days int)` (SECURITY DEFINER, search_path=public) returning jsonb: total_users, total_agents, active_agents (agents with an operation in window), operations, window_days, criteria breakdown, and daily trend[]. "Active" = an agent with any qualifying operation (house list / promissory / behalf rent request / sub-agent add) in the last p_days.

UI: `src/components/executive/agent-ops-v2/AgentDefinitionFunnel.tsx` renders the Total Users → Agents → Active funnel + operations/active trend, shown at the top of `AgentOpsHomeView`. Range 24h/7d/1m maps to p_days 1/7/30.
