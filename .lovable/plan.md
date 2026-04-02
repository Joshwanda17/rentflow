

# Commission Engine: 10% Repayment Split + Event Bonuses

## Current State
- `credit_agent_rent_commission` RPC pays a **flat UGX 10,000** per repayment (8k agent + 2k parent override)
- Only tracks the **current assigned agent** via `COALESCE(assigned_agent_id, agent_id)`
- No concept of "Source Agent" (onboarding) vs "Manager" (current) split
- `commission_accrual_ledger` exists but lacks `percentage` and `event_type` columns
- `rentCalculations.ts` has `calculateAgentCommission` returning 5% (unused in the RPC)

## New Split Logic (always totals exactly 10%)

```text
Repayment of UGX 100,000:

Case 1: Source ≠ Manager, Manager has no recruiter
  Source (agent_id):            UGX  2,000  (2%)
  Manager (assigned_agent_id):  UGX  8,000  (8%)
  Total:                        UGX 10,000  (10%) ✓

Case 2: Source ≠ Manager, Manager was recruited by another agent
  Source (agent_id):            UGX  2,000  (2%)
  Manager (assigned_agent_id):  UGX  6,000  (6%)
  Recruiter (parent_agent_id):  UGX  2,000  (2%)
  Total:                        UGX 10,000  (10%) ✓

Case 3: Source = Manager (same person)
  Agent gets full:              UGX 10,000  (10%)
  (recruiter override still applies if exists → 8% + 2%)

Case 4: No assigned_agent_id → agent_id is both source & manager
  Same as Case 3
```

## Changes

### 1. Database Migration

**Add columns to `commission_accrual_ledger`:**
- `percentage NUMERIC` — the percentage rate applied
- `event_type TEXT` — enum-like: `repayment`, `rent_request_posted`, `house_listed`, `tenant_replacement`, `subagent_registration`
- `commission_role TEXT` — `source_agent`, `tenant_manager`, `recruiter_override`
- `rent_request_id UUID` — link back to the rent request
- `repayment_amount NUMERIC` — the repayment this commission was calculated from

### 2. Rewrite `credit_agent_rent_commission` RPC

Replace flat UGX 10,000 logic with percentage-based split:

1. Look up `agent_id` (Source) and `assigned_agent_id` (Manager) from `rent_requests`
2. If Source = Manager (or no assigned_agent_id): treat as single agent getting 10%
3. If Source ≠ Manager: Source gets 2%, Manager gets 8%
4. If Manager has a recruiter in `agent_subagents`: Manager drops to 6%, recruiter gets 2%
5. Each split inserts into both `general_ledger` (wallet credit) and `commission_accrual_ledger` (audit)
6. Idempotency guard per source_id + agent_id combination (already exists)
7. Total commission = `ROUND(p_repayment_amount * 0.10)` — computed once, splits derived from it

### 3. Event-Based Bonus RPC: `credit_agent_event_bonus`

New RPC for fixed-amount event commissions:
- `rent_request_posted` → UGX 5,000
- `house_listed` → UGX 5,000
- `tenant_replacement` → UGX 20,000
- `subagent_registration` → UGX 10,000

Inserts into `general_ledger` + `commission_accrual_ledger` with `event_type` set. Same idempotency pattern.

### 4. Update `rentCalculations.ts`

- Change `calculateAgentCommission` from 5% to 10%
- Add helper constants: `COMMISSION_RATE = 0.10`, `SOURCE_RATE = 0.02`, `MANAGER_RATE = 0.08`, `RECRUITER_RATE = 0.02`
- Add event bonus constants map

### 5. Update `CommissionAccrualLedger.tsx`

- Display new columns: `percentage`, `event_type`, `commission_role`
- Group/filter by event type

### 6. No caller changes needed

All edge functions already call `credit_agent_rent_commission` with the same signature — the RPC change is backward-compatible (same params, returns jsonb).

## Files Changed

| File | Action |
|------|--------|
| Migration SQL | Add columns to `commission_accrual_ledger`, rewrite RPC, create event bonus RPC |
| `src/lib/rentCalculations.ts` | Update rates and add constants |
| `src/components/ledgers/CommissionAccrualLedger.tsx` | Display new fields |

## Risks
- Existing flat UGX 10,000 commissions in ledger will not have the new columns populated (historical data) — acceptable, new columns are nullable
- 10% of repayment may be larger or smaller than the old flat 10,000 — this is the intended business change

