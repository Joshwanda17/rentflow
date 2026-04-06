

# Fix HR Overview Scrolling + Professional Employee Directory Table

## Changes

### 1. Make HR Overview Scrollable
**File: `src/components/layout/ExecutiveDashboardLayout.tsx`**
- The `<main>` content area (line 166) needs `overflow-y-auto` added to allow scrolling within the executive dashboard layout. Currently it's `overflow-x-hidden` only.

### 2. Redesign Employee Directory as a Professional Table
**File: `src/components/hr/HREmployeeDirectory.tsx`** (full rewrite)

Replace the card-based list with a proper `<Table>` component:
- Columns: Avatar + Name, Email, Phone, Department, Position, Roles (badges), Status (active/disabled)
- Advanced filters bar: search input, role dropdown, status dropdown (All/Active/Disabled), department dropdown
- Sortable columns (click header to sort by name, department, status)
- Row count summary in header
- Clickable rows that open a detail/action panel

### 3. Employee Detail Drawer on Row Click
**File: `src/components/hr/HREmployeeDetailDrawer.tsx`** (new file)

When HR clicks an employee row, a slide-over `Dialog` or `Sheet` opens showing:
- **Profile section**: avatar, name, email, phone, employee ID, department, position
- **Roles section**: list of assigned roles with enable/disable toggles (reusing the same audited pattern from `HRUserManagement`)
- **Actions**: "Add Role" button, role toggle with mandatory audit reason (min 10 chars)
- **Role change history**: queried from `audit_logs` for that user
- All mutations log to `audit_logs` with action types `hr_role_assigned`, `hr_role_toggled`

### 4. Wire It Together
**File: `src/pages/hr/Dashboard.tsx`** - no changes needed, already renders `HREmployeeDirectory`

## Technical Details

- Reuse existing `Table, TableHeader, TableBody, TableRow, TableHead, TableCell` from `@/components/ui/table`
- Reuse existing mutation/audit patterns from `HRUserManagement.tsx`
- Add `Sheet` component (from shadcn/ui) for the detail drawer if not present; otherwise use `Dialog`
- Keep all audit logging with 10-char minimum reason requirement
- Filter state managed via `useState` hooks
- Data query stays the same (user_roles + profiles + staff_profiles join)

## Files Modified
| File | Action |
|---|---|
| `src/components/layout/ExecutiveDashboardLayout.tsx` | Add `overflow-y-auto` to main |
| `src/components/hr/HREmployeeDirectory.tsx` | Rewrite as table with filters + row click |
| `src/components/hr/HREmployeeDetailDrawer.tsx` | New — detail drawer with role management + audit |

