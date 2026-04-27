# Fix: Reject button silently failing under Landlord Ops → Verification

## Root cause

The Reject button calls the database function `reject_house_listing(p_listing_id, p_reason)`, which **only allows these roles** to execute:

- `super_admin`
- `ceo`
- `cto`
- `manager`

But the **Landlord Ops dashboard** itself is gated by `staff_permissions.permitted_dashboard = 'landlord-ops'`, which is granted to many staff who do **not** hold any of those four roles (e.g. Grace Paul Ochieng, Grace Paul, LOLEM FIRICILA, Mukhaye Lydia — all have landlord-ops access but no `manager`/`super_admin`/`ceo`/`cto`).

For those operators, clicking Reject:
1. Opens the reason dialog
2. Submits the RPC
3. RPC throws `"Not authorized to reject listings"`
4. Toast briefly flashes "Reject Failed" (easy to miss on mobile) — listing stays unchanged

This is the same "asymmetric gating" pattern as the Verify button (`credit-listing-bonus` edge function), except Verify uses an edge function with service-role privileges + permission check, while Reject uses a hardcoded role check in the RPC.

## The fix

Update `reject_house_listing` to accept **either** the four privileged roles **or** any staff with the `landlord-ops` dashboard permission — matching how the dashboard itself decides who can be there.

```sql
-- New authorization clause (replaces the existing OR chain)
IF NOT (
  public.has_role(v_caller, 'super_admin'::app_role)
  OR public.has_role(v_caller, 'ceo'::app_role)
  OR public.has_role(v_caller, 'cto'::app_role)
  OR public.has_role(v_caller, 'manager'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.staff_permissions
    WHERE user_id = v_caller
      AND permitted_dashboard = 'landlord-ops'
  )
) THEN
  RAISE EXCEPTION 'Not authorized to reject listings';
END IF;
```

This mirrors the dashboard's own gating, so anyone who can see the Reject button can actually use it. Audit-trail attribution is unaffected (still records `v_caller`).

## Secondary improvement: louder error surfacing

The current dialog catches the RPC error and shows a single toast. Mobile operators have repeatedly missed it (matches the pattern from the deposit silent-failure incident). Update `EmptyHouseActionDialog.handleSubmit` so:

- The error message stays visible inline in the dialog (not just a toast)
- The dialog does NOT close on failure — operator sees what happened
- Console logs the full error object for support diagnostics

## Files changed

1. **Database migration** — replace `public.reject_house_listing` with the broadened authorization check (single `CREATE OR REPLACE FUNCTION` statement, same signature, same return shape).
2. **`src/components/executive/landlord-ops/EmptyHouseActionDialog.tsx`** — keep dialog open on error, show inline error banner, log full error to console.

## Out of scope

- No changes to `verify_house_listing` / `credit-listing-bonus` (Verify already works).
- No changes to the dashboard's existing `staff_permissions` gating.
- The 4 unverified listings shown in the screenshot are unaffected by data — only the action handler needs the fix.

## Verification after deploy

1. Log in as a staff with only `landlord-ops` permission (no `manager` role).
2. Open Landlord Ops → Verification Queue.
3. Click Reject on any unverified listing → enter reason ≥10 chars → confirm.
4. Listing disappears from the queue, agent receives a `🚫 Listing Rejected` notification, audit log row created with `action_type='listing_rejected'`.
