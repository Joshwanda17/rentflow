# Financial Agent Requisition Flow

## Overview

Financial agents can request funds with a purpose/justification. The request goes to CFO for approval. On approval, the agent's wallet is credited. To get cash out, the agent must then withdraw (Financial Ops approval).

## Architecture Decision

Reuse the existing `pending_wallet_operations` table with a new category `agent_requisition`. This keeps the flow consistent with ROI and payout approvals — same CFO approval pipeline, same edge function, same audit trail.

## Changes

EVERYTHING SHOULD BE LOGGED 

### 1. New Component: Agent Requisition Form

**File**: `src/components/financial-ops/AgentRequisitionForm.tsx`

A form for financial agents to submit fund requests:

- Amount (UGX)
- Purpose (dropdown: operations, marketing, R&D, salaries, agent advances, employee advances, general)
- Description (min 10 chars — mandatory justification)
- Submit → inserts into `pending_wallet_operations` with:
  - `category: 'agent_requisition'`
  - `operation_type: 'agent_requisition'`
  - `user_id: agent's user ID`
  - `status: 'pending'`
  - `metadata: { purpose, description }`
- Also shows the agent's own request history with status badges

### 2. Add Requisition Form to Financial Ops Command Center

**File**: `src/components/financial-ops/FinancialOpsCommandCenter.tsx`

Add a new tool entry: `{ id: 'requisitions', label: 'Fund Requisitions', icon: FileText }` so financial agents can access it from their command center.

### 3. New Component: CFO Requisition Review Panel

**File**: `src/components/cfo/CFOAgentRequisitions.tsx`

CFO-facing panel showing all `pending_wallet_operations` where `category = 'agent_requisition'`:

- Agent name, amount, purpose, description, timestamp, status
- Approve button → calls `approve-wallet-operation` edge function → credits agent wallet
- Reject button → requires 10-char reason → updates status to `rejected`
- Filter by status (pending/approved/rejected)

### 4. Add to CFO Dashboard Sidebar

**File**: `src/components/layout/executiveSidebarConfig.ts`

Add `{ label: 'Agent Requisitions', icon: FileText, id: 'agent-requisitions' }` under the Disbursements section.

### 5. Wire Up in CFO Dashboard

**File**: `src/pages/cfo/Dashboard.tsx`

Add case `'agent-requisitions'` → render `<CFOAgentRequisitions />`.

### 6. Add to Legacy CFO Dashboard

**File**: `src/pages/CFODashboard.tsx`

Add a new tab for agent requisitions.

### 7. Notifications

- On submission: notify CFO users with `approval_required` type
- On approval: notify the requesting agent with `requisition_approved`
- On rejection: notify the requesting agent with `requisition_rejected` and reason

## No Database Migration Needed

The `pending_wallet_operations` table already has all required fields (`amount`, `category`, `description`, `metadata`, `status`, `user_id`, `reviewed_by`, `reviewed_at`, `rejection_reason`). We just use a new category value `agent_requisition`.

## Flow Summary

```text
Agent submits requisition (pending_wallet_operations, status: pending)
  → CFO approves → approve-wallet-operation edge fn → ledger credit → wallet credited
    → Agent requests withdrawal → Financial Ops approves → cash out
```


| Change                           | File                                    |
| -------------------------------- | --------------------------------------- |
| Agent requisition form + history | `AgentRequisitionForm.tsx` (new)        |
| CFO requisition review panel     | `CFOAgentRequisitions.tsx` (new)        |
| Add tool to Financial Ops center | `FinancialOpsCommandCenter.tsx`         |
| Add sidebar item for CFO         | `executiveSidebarConfig.ts`             |
| Wire up CFO dashboard routes     | `cfo/Dashboard.tsx`, `CFODashboard.tsx` |
