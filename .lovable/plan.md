

# Manager Approval Audit Visibility for CFO

## Overview
Add a dedicated "Approval Audit" tab to the CFO dashboard showing all manager-approved/rejected financial operations with filters and summary metrics. No database migration needed — all data exists in `pending_wallet_operations`.

## Changes

### 1. New Component: `src/components/cfo/ManagerApprovalAudit.tsx`

Queries `pending_wallet_operations` where `status IN ('approved','rejected')` and `reviewed_by IS NOT NULL`. Fetches `profiles` separately for reviewer names (decoupled query pattern per project conventions).

**Summary cards (top):**
- Total approved amount (today)
- Total operations reviewed
- Unique approvers count
- Approval vs rejection ratio (percentage)

**Filters:**
- Date range: Today / This Week / This Month / All
- Manager dropdown (populated from distinct `reviewed_by` values)
- Status: All / Approved / Rejected

**Table columns:**
- Amount (formatted UGX)
- Approved By (name from profiles)
- Role (from user_roles join)
- Approved At (formatted timestamp)
- Category (operation_type/category)
- Status (Badge: green=approved, red=rejected)
- Description

Mobile: card layout fallback. Uses existing `Card`, `Badge`, `Select`, `Table` components and `useQuery`.

### 2. Sidebar: `src/components/layout/executiveSidebarConfig.ts`

Add to CFO Finance section (after "Wallet Retractions"):
```
{ label: 'Approval Audit', icon: ShieldCheck, id: 'approval-audit' }
```

Import `ShieldCheck` from lucide-react.

### 3. Dashboard: `src/pages/cfo/Dashboard.tsx`

- Import `ManagerApprovalAudit`
- Add switch case `'approval-audit'` → `<ManagerApprovalAudit />`

## No Migration Needed
`pending_wallet_operations` already has `reviewed_by`, `reviewed_at`, `amount`, `status`, `category`, `description`. Access is role-gated by the CFO dashboard layout.

