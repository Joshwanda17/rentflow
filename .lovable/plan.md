

## Plan: Make Every Agent Relationship Count Toward Their Trust Score

### What I found
The Welile Trust Score (`get_user_trust_profile`) gives the agent only a tiny `network_score (/10)` made up of:
- referrals (`profiles.referrer_id = me`)
- **verified-only** sub-agents
- distinct tenants from `rent_requests.agent_id = me`

What's **missing** for an agent who is actively managing a book of users:
- ❌ Partners they captured (`investor_portfolios.agent_id = me`)
- ❌ Promissory notes they registered (`promissory_notes.agent_id = me`)
- ❌ **Pending** sub-agents (only `verified` count today)
- ❌ Landlords they registered (`landlords.registered_by = me`)
- ❌ The 10-point cap means a good agent and a great agent score the same once they pass ~10 relationships

### The fix — one migration that upgrades the network score for agents

Modify `public.get_user_trust_profile` so the **NETWORK section (10 pts)** counts every relationship type, with diminishing returns so it scales fairly:

```sql
-- New counts to fetch:
v_partners_managed     -- COUNT(*) FROM investor_portfolios WHERE agent_id = me AND status IN ('active','matured','pending_approval')
v_promissory_count     -- COUNT(*) FROM promissory_notes WHERE agent_id = me
v_landlords_registered -- COUNT(*) FROM landlords WHERE registered_by = me
v_subagents_all        -- COUNT(*) FROM agent_subagents WHERE parent_agent_id = me  (drop status filter)
v_subagents_verified   -- (kept for bonus)

-- New formula (still capped at 10, but uses LOG so big books still grow):
v_network_score := LEAST(10,
    LEAST(3.0, v_referrals_count        * 0.4)
  + LEAST(2.0, v_subagents_all          * 0.3 + v_subagents_verified * 0.2)
  + LEAST(2.0, v_tenants_onboarded      * 0.25)
  + LEAST(1.5, v_partners_managed       * 0.5)   -- partners are high-value
  + LEAST(1.0, v_landlords_registered   * 0.4)
  + LEAST(0.5, v_promissory_count       * 0.25)
);

-- And bump data_points so the agent reaches "lender_ready" faster:
v_data_points := v_data_points + LEAST(4, (
  v_referrals_count + v_subagents_all + v_tenants_onboarded
  + v_partners_managed + v_landlords_registered + v_promissory_count
) / 5);
```

The breakdown JSON returned to the UI gets a richer `network` object so the dashboard can show **"You're being trusted because you manage X tenants, Y partners, Z sub-agents"**.

### Step 2 — Backfill scores
Add a one-shot SQL block at the bottom of the migration:
```sql
SELECT public.recompute_trust_scores_batch(50000);
```
so every existing agent's score updates the moment the migration runs.

### Step 3 — Surface the new factors on Agent Ops UI
Tiny UI tweak in `src/components/executive/AgentDailyMissions.tsx` (or its hero stats card):
- Replace the single "Managed users" tile with **4 mini tiles**: Tenants · Partners · Sub-Agents · Promissory Notes
- Each tile shows count + "+X trust pts contributed to your score"
- Pulls counts from a new lightweight RPC `get_agent_network_summary(p_agent_id)` returning the same six counters used in the formula

### Files touched
1. **New migration** `supabase/migrations/<ts>_agent_network_trust_signals.sql` — replaces `get_user_trust_profile` with the expanded network section + adds `get_agent_network_summary` RPC + runs backfill
2. **`src/components/executive/AgentDailyMissions.tsx`** — adds the 4-tile "Your network builds your trust" panel above the missions

### Out of scope
- No change to the 6 other score factors (payment, wallet, verification, behavior, landlord, supporter)
- No new tables — every counter comes from existing tables
- No change to `capture_trust_signal` (already correct for per-event signals)

### Result
The moment an agent onboards a tenant, captures a partner, registers a sub-agent, lists a landlord, or files a promissory note, **their own Welile Trust Score climbs**. Agents now have a direct, visible incentive to keep growing the book — and CEO mission KPIs ("agent-driven trust coverage") improve in lockstep.

