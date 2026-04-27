## Fix My Tenants — names not rendering & list shows wrong tenants

Two issues on the agent **My Tenants** sheet (`src/components/agent/AgentTenantsSheet.tsx`):

### 1. Names invisible (layout bug)

The avatar correctly shows the first letter (`N`, `A`), proving `tenant.full_name` reaches the row. But the name `<p>` collapses to zero visible text because:

- It uses `truncate` (which clips overflow) inside a flex row.
- The right-hand column (amount + **Field Collect** button) has no `shrink-0` on its outer container, so on narrow phones it expands and squeezes the name slot to ~0 width → `truncate` clips the entire name.

**Fix (line ~714–822):**
- Add `shrink-0` to the right-side amount/button column wrapper (line 822 already has `shrink-0`, but the **Field Collect button** widens it on every render — wrap the column in a fixed/max-width and set `whitespace-nowrap` only where intended).
- Replace `truncate` on the name `<p>` (line 716) with `break-words` and keep `min-w-0` on the parent (line 714, already present). Long names wrap to a 2nd line instead of vanishing.
- Verify the row still looks clean on iPhone SE width (375px).

### 2. Joshua sees 104 tenants (scope leak via admin RLS)

Joshua Wanda has roles `agent + manager + cfo + super_admin`. The `fetchTenants` queries (lines 172–207) rely on RLS to filter rows, but admin RLS policies grant him every profile, so the `.in('id', uniqueIds)` call returns far more than intended whenever superuser policies overlap.

In practice the bigger source of bloat is that `extraTenantIds` is built from referrals + `rent_requests.tenant_id` where `agent_id = user.id`, and the resulting `.in()` profile fetch is unfiltered by the agent relationship — any RLS-visible row passes through.

**Fix:**
- Keep the source-of-truth join client-side: only render tenants whose IDs come from one of three explicit agent-owned sources:
  1. `profiles.referrer_id = user.id`
  2. `referrals.referrer_id = user.id`
  3. `rent_requests.agent_id = user.id`
- After fetching extra profiles by ID, filter the merged `tenantList` to `referredIds ∪ extraTenantIds` (it already is in code, but make this explicit and guard against duplicates by ID).
- Add a console warning when the merged list size exceeds the union size — surfaces future RLS leaks early.

This makes the page show only Joshua's actual ~2 tenants regardless of his admin roles.

### Files touched

- `src/components/agent/AgentTenantsSheet.tsx` — layout fix (name `<p>` + right column) and tighter scoping in `fetchTenants`.

### Out of scope

- No DB / RLS changes. Admin roles still see all tenants elsewhere; this is a UI-scope fix specific to the agent **My Tenants** page.
- No changes to Field Collect, risk chips, or the expanded details panel.

### QA checklist

- Joshua sees only his real referrals/assignments (expected: ~2 rows).
- Both tenants render full names (`Namukisha Esther`, `Akandinda Wilson`) above their phone numbers.
- Long names wrap instead of disappearing on 375px width.
- Field Collect button still tappable; amount column still right-aligned.
