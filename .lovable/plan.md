

# Refactor Proxy Agent Manager: Table Layout + KPIs + Actions

## What Changes

Convert the card-based proxy agent list into a proper table with KPI summary cards at the top and edit/delete actions per row.

## Changes

### File: `src/components/cfo/ProxyAgentManager.tsx`

**1. Add KPI Summary Cards (top of page)**
Computed from the `assignments` array:
- **Total Assignments** — `assignments.length`
- **Unique Agents** — count of distinct `agent_id`
- **Partners Assigned** — count of distinct `beneficiary_id`
- **Managed Accounts** — count where `is_managed_account === true`

Render as a 4-column grid of small summary cards above the table.

**2. Replace card list with a Table**
Use the existing `Table` components from `@/components/ui/table`. Columns:
- **#** (index)
- **Agent** (name + phone)
- **Partner/Beneficiary** (name + phone)
- **Role** (Landlord / Partner badge)
- **Managed** (Yes/No badge)
- **Reason** (text)
- **Date Assigned** (`created_at` formatted)
- **Actions** (Edit + Delete buttons)

**3. Add Edit functionality**
- New state: `editingAssignment` (holds the assignment being edited)
- Reuse the existing Dialog but in "edit mode" — pre-fill fields with current values
- On save: `supabase.from('proxy_agent_assignments').update(...)` for `beneficiary_role`, `reason`, `is_managed_account`
- Agent and beneficiary are read-only in edit mode (can't swap people, only update metadata)

**4. Delete action**
- Already exists as `deactivateMutation` — wire it to a Trash icon button in the Actions column
- Add a confirmation step (simple `window.confirm` or inline)

**5. Imports to add**
- `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` from `@/components/ui/table`
- `Pencil, Trash2` from `lucide-react`
- `format` from `date-fns`

| Change | Detail |
|--------|--------|
| KPI cards | 4 summary metrics at top |
| Table layout | Replace card list with proper table |
| Edit action | Dialog with pre-filled fields, updates metadata |
| Delete action | Existing deactivate with confirmation |

**Single file change:** `src/components/cfo/ProxyAgentManager.tsx`

