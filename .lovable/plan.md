

# Plan: Update Agent Advance Financial Model

## What's Changing

The current system uses **33% daily compound interest** (wildly explosive). The user wants to change to **33% monthly compounding** with variable repayment periods and a registration fee.

### New Financial Formula

| Component | Calculation |
|---|---|
| Registration fee | UGX 10,000 if principal ≤ 200,000; UGX 20,000 if > 200,000 |
| Access fee (33% monthly compounding) | `principal × (1.33^(days/30) - 1)` |
| Total payable | Principal + Access fee + Registration fee |
| Daily payment | Total ÷ Period days |

### Repayment periods
Selectable: **7, 14, 30, 60, or 90 days** (replacing the fixed 30-day cycle).

### Examples (UGX 500,000 principal)
- 7 days: 500k × 1.33^(7/30) = ~538k + 10k reg = ~548k → ~78k/day
- 30 days: 500k × 1.33 = 665k + 20k reg = 685k → ~22.8k/day  
- 90 days: 500k × 1.33³ = ~1,177k + 20k reg = ~1,197k → ~13.3k/day

---

## Database Migration

Add `registration_fee` column to `agent_advances` table (default 0). The `cycle_days` column already exists and will store the selected period. Change `daily_rate` default to 0.33 (monthly rate now, not daily).

---

## Files to Edit

### 1. `src/lib/agentAdvanceCalculations.ts`
- Rename/refactor: rate is now **monthly**, not daily
- `calculateAccessFee(principal, days)` → `principal × (1.33^(days/30) - 1)`
- `calculateRegistrationFee(principal)` → 10,000 or 20,000
- `calculateTotal(principal, days)` → principal + accessFee + regFee
- `calculateDailyPayment(principal, days)` → total ÷ days
- Update projection to show monthly compounding growth, not daily 33%

### 2. `src/components/manager/IssueAdvanceSheet.tsx`
- Add repayment period selector (7, 14, 30, 60, 90 days)
- Show registration fee in preview
- Update projection to use new formula
- Pass `cycle_days` and `registration_fee` when inserting advance

### 3. `src/pages/AgentAdvances.tsx`
- Update subtitle from "33% daily compound" to "33% monthly compound"
- Update daily deduction calculation in table to use new formula

### 4. `src/pages/AgentAdvanceDetail.tsx`
- Update projection table to use monthly compounding
- Show registration fee in summary cards

### 5. `supabase/functions/process-agent-advance-deductions/index.ts`
- Change daily interest calculation from `balance × 0.33` to monthly equivalent: `balance × (1.33^(1/30) - 1)` per day

