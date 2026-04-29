## Problem

The Tenant Payments Report shows `AGENT-COLLECTED UGX 0` and "Direct (no agent)" for every row, even though every payment in the selected period (28–29 Apr 2026) was collected by an agent through the Float-Allocation flow.

## Root cause (verified against the live ledger)

`TenantOpsDashboard.handleDownloadRentReport()` decides "agent-collected vs direct" by looking up `general_ledger.source_id` in the `agent_collections` table. For Float-Allocation deposits (the dominant agent path today), the `source_id` on the `tenant_repayment cash_in` leg is an **allocation/batch UUID that does not exist in `agent_collections`**. The lookup misses, `isAgentCollection = false`, the row is bucketed as Direct, and the agent column falls back to assigned/referrer (also empty for these tenants), printing "Direct (no agent)".

Concretely, every Float-Allocation transaction posts a balanced 4-leg group sharing one `transaction_group_id`:

```text
agent_float_used_for_rent   cash_out   user_id = AGENT
tenant_repayment            cash_in    user_id = TENANT
agent_commission_earned     cash_in    user_id = AGENT
agent_commission_earned     cash_out   user_id = PLATFORM
```

The agent's identity lives on the `agent_float_used_for_rent` (or commission) leg, not on the tenant_repayment leg. That's the signal the report should use.

## Fix

All edits in `src/components/executive/TenantOpsDashboard.tsx` (the report-builder block, lines ~85–250). PDF template untouched.

### 1. Pull every leg in the same transaction group

After fetching the in-range `tenant_repayment / rent_repayment cash_in` rows (call this `payments`), collect their `transaction_group_id`s and run a second query:

```text
select user_id, category, direction, transaction_group_id
from general_ledger
where transaction_group_id in (...)
  and category in ('agent_float_used_for_rent', 'agent_commission_earned')
```

Build `agentByGroup: Map<group_id, agent_user_id>` from the `agent_float_used_for_rent cash_out` leg first (preferred), falling back to `agent_commission_earned cash_in` if the float leg is missing.

### 2. Per-payment attribution priority (rewrite)

Replace the current 3-step priority with:

1. `agentByGroup.get(p.transaction_group_id)` — Float-Allocation agent (covers ~all current production data).
2. Existing `collectionMap` lookup on `agent_collections` (legacy manual-collect-rent path).
3. `assignedAgentByTenant` — agent on the active rent_request.
4. `referrerAgentByTenant` — onboarding agent (profiles.referrer_id, role=agent).

If ANY of (1) or (2) match, set `isAgentCollection = true` and use that agent for the row. (3) and (4) are display-only fallbacks for the "Agent" column — they should NOT flip a Direct payment into "agent-collected".

### 3. Fix the silent-self payment edge case

When the resolved `agentId === tenantId` (the test/multi-role case we have today), still count it as agent-collected — that's what actually happened — but display the agent name with a `(self)` suffix so reviewers aren't confused.

### 4. Make sure `transaction_group_id` is in the SELECT

The current query selects `user_id, amount, source_id, source_table, transaction_date`. Add `transaction_group_id` so step (1) has the join key. (Confirmed the column exists on `general_ledger`.)

### 5. Light agent-name UX polish in the table

When the resolved agent matches but the tenant has multiple payments split across agents, keep the existing `Set<string>` join. When `isAgentCollection` is true but no name resolves (deleted profile), show `Agent (deleted)` instead of `—`, so a Direct row and an agent row with a missing profile can never look identical.

## Verification

After the fix, regenerating the report for 28–29 Apr 2026 should show:

- DIRECT PAYMENTS: UGX 0
- AGENT-COLLECTED: UGX 145,000
- Both rows ("LOLEM FIRICILA", "Muwanguzi Fred") tagged Channel = "Agent" with the resolved agent name (or `(self)` for the multi-role test users).

## Out of scope

- Changing the underlying ledger / float-allocation accounting (the legs already balance correctly).
- The PDF layout (`generateTenantOpsReportPdf.ts`).
- Outstanding-balance math (already ledger-driven and accurate).
