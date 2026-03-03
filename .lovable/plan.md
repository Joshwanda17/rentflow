

# Plan: Agent Advance Credit Control Module

## Overview
Add an "Agent Advance" menu item to the admin dashboard and build a full fintech-grade credit control system with 33% daily compound interest, 30-day cycles, daily auto-deductions from agent wallets, and top-up merging.

---

## Database Schema (Migration)

### Table: `agent_advances`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| agent_id | uuid FK profiles | |
| principal | numeric | Original amount issued |
| outstanding_balance | numeric | Current total owed (principal + accrued interest - deductions) |
| daily_rate | numeric | 0.33 (33%) |
| cycle_days | integer | 30 |
| issued_at | timestamptz | |
| expires_at | timestamptz | issued_at + 30 days |
| status | text | 'active', 'completed', 'overdue' |
| issued_by | uuid FK profiles | Manager who issued |
| created_at / updated_at | timestamptz | |

### Table: `agent_advance_ledger`
Daily log of interest accrual and deductions:
| Column | Type |
|---|---|
| id | uuid PK |
| advance_id | uuid FK agent_advances |
| date | date |
| opening_balance | numeric |
| interest_accrued | numeric |
| amount_deducted | numeric |
| closing_balance | numeric |
| deduction_status | text ('full', 'partial', 'none') |
| created_at | timestamptz |

### Table: `agent_advance_topups`
| Column | Type |
|---|---|
| id | uuid PK |
| advance_id | uuid FK agent_advances |
| amount | numeric |
| topped_up_by | uuid FK profiles |
| created_at | timestamptz |

RLS: Manager-only read/write access using `has_role()`.

---

## Edge Functions

### 1. `issue-agent-advance`
- Accepts agent_id, amount
- If active advance exists: insert topup record, add amount to outstanding_balance
- Otherwise: create new advance record
- Returns compound projection preview

### 2. `process-agent-advance-deductions` (daily cron)
- For each active advance:
  - Calculate daily interest: `outstanding_balance * 0.33`
  - Add interest to outstanding_balance
  - Check agent wallet balance
  - Deduct min(wallet_balance, outstanding_balance) from wallet
  - Log entry in `agent_advance_ledger`
  - If outstanding_balance reaches 0: mark 'completed'
  - If past 30 days and balance > 0: mark 'overdue'

---

## Frontend Pages & Components

### 1. Navigation (menu item only — no layout changes)
- Add "Agent Advance" item to:
  - `ManagerDashboard.tsx` menuItems array (line ~831)
  - `DesktopManagerSidebar.tsx` quickLinks array
  - `MobileManagerMenu.tsx` menu items
  - `MobileQuickMenu.tsx` menu items
- Route: `/agent-advances`
- New page: `src/pages/AgentAdvances.tsx`

### 2. Agent Advance Overview Page (`/agent-advances`)
- Top summary cards: Total Issued, Outstanding Balance, Accrued Interest, Overdue Exposure, Risk %
- Filterable table (Active/Completed/Overdue) with agent name, principal, interest, total payable, daily deduction, issue date, days remaining, status
- Color-coded risk indicators (green/yellow/red)
- Blue executive theme using existing Tailwind utilities
- Click row → drill-down

### 3. Issue / Top-Up Sheet (dialog on same page)
- Agent selector (from profiles with agent role)
- Amount input
- Real-time compound projection preview (principal, daily interest growth, 30-day total, estimated daily deduction)
- If active advance exists: show "Top-Up" mode with merged recalculation
- Confirm button

### 4. Agent Drill-Down Page (`/agent-advances/:id`)
- Compound calculation breakdown
- Daily ledger table: date, interest added, amount deducted, remaining balance
- Top-up history
- Risk indicator
- Wallet balance trend chart (recharts)
- Back button

### 5. Utility: `src/lib/agentAdvanceCalculations.ts`
- `calculateCompoundProjection(principal, dailyRate, days)` — returns day-by-day projection
- `calculateDailyDeduction(totalOwed, daysRemaining)` — estimated daily deduction
- Used by both UI preview and edge function logic

---

## Cron Job
- Schedule `process-agent-advance-deductions` daily at 05:00 AM UTC via `pg_cron` + `pg_net`

---

## Files to Create
1. `src/pages/AgentAdvances.tsx` — overview page
2. `src/pages/AgentAdvanceDetail.tsx` — drill-down page
3. `src/components/manager/AgentAdvanceOverview.tsx` — summary + table
4. `src/components/manager/IssueAdvanceSheet.tsx` — issue/top-up dialog
5. `src/lib/agentAdvanceCalculations.ts` — compound math utilities
6. `supabase/functions/issue-agent-advance/index.ts`
7. `supabase/functions/process-agent-advance-deductions/index.ts`

## Files to Edit
1. `src/App.tsx` — add routes
2. `src/components/dashboards/ManagerDashboard.tsx` — add menu item
3. `src/components/manager/DesktopManagerSidebar.tsx` — add quick link
4. `src/components/manager/MobileManagerMenu.tsx` — add menu item
5. `src/components/MobileQuickMenu.tsx` — add menu item

