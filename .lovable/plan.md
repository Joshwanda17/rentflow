

## Diagnosis — Why approvals fail silently

I traced the silent failures across all the approval surfaces. There are **two independent bugs**, both producing the same "click → nothing happens" symptom.

### Bug 1 — Edge function error messages are swallowed (Withdrawal approvals)

In `FinOpsWithdrawalVerification.tsx`, `AgentCashPayoutsTab.tsx`, and `ApprovalQueue.tsx` the code does:

```ts
const { data, error } = await supabase.functions.invoke('approve-withdrawal', {...});
if (error) throw error;                        // <- error.message is generic
if (data?.error) throw new Error(data.error);  // <- never reached on non-2xx
```

When `approve-withdrawal` returns **400 / 403 / 404 / 409** (insufficient balance, invalid status, role-check failed, withdrawal not found, already approved), the Supabase SDK wraps it in a `FunctionsHttpError` whose `.message` is the generic string `"Edge Function returned a non-2xx status code"`. The actual JSON body (`{ error: "Insufficient commission..." }`) lives in `error.context` and is never read. Result: a useless toast or — when the toast text is empty — no visible feedback at all.

The project already ships a helper (`src/lib/extractEdgeFunctionError.ts`) that solves this. It just isn't wired into these three files.

Live evidence from the DB: 10 of the 15 most-recent pending withdrawals are **proxy-partner withdrawals** booked under one agent's `user_id` (`ae194750…`). When FinOps clicks Approve, `approve-withdrawal` checks **the agent's** wallet/commission balance for amounts like UGX 7,520,000 — which fails — and the user only sees the generic error.

### Bug 2 — Agent Advance approvals are blocked by RLS for 3 of the 4 stages

`AdvanceRequestsQueue.tsx` runs a direct `supabase.from('agent_advance_requests').update(...)` for stages `agent_ops`, `tenant_ops`, `landlord_ops`, and `coo`.

The RLS UPDATE policy on `agent_advance_requests` is:

```
super_admin OR manager OR cfo OR coo
```

So users with `agent_ops`, `tenant_ops`, or `landlord_ops` roles can't update — the UPDATE silently affects 0 rows and PostgREST returns success (no error). The mutation's `onSuccess` toast fires, but the row never moves to the next stage. The same SELECT policy also hides the queue from those roles.

---

## The fix

### Part A — Surface real edge-function errors (Withdrawal flows)

In each of the three files, replace the generic `error.message` extraction with the existing helper, so toasts show the real backend reason ("Insufficient commission balance: UGX X, requested: UGX Y", "Cannot approve: withdrawal is already 'approved'", "Forbidden: insufficient role", etc.):

- `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — `handleApprove` and `handleReject`
- `src/components/agent/AgentCashPayoutsTab.tsx` — `completeWithdrawal` mutation
- `src/components/financial-ops/ApprovalQueue.tsx` — bulk approve loop (line ~273) — show the real body error instead of `'unknown error'`

Use `extractFromErrorObject(error)` / `extractEdgeFunctionError({ data, error })` from `@/lib/extractEdgeFunctionError`.

### Part B — Allow ops-stage roles to approve advance requests

Database migration to extend `agent_advance_requests` RLS so each ops stage can read and update:

```sql
DROP POLICY "Ops and executives can update advance requests" ON public.agent_advance_requests;
DROP POLICY "Ops and executives can view all advance requests" ON public.agent_advance_requests;

CREATE POLICY "Ops staff and executives can view advance requests"
  ON public.agent_advance_requests FOR SELECT
  USING (
    has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'manager')
    OR has_role(auth.uid(),'cfo')      OR has_role(auth.uid(),'coo')
    OR has_role(auth.uid(),'agent_ops')
    OR has_role(auth.uid(),'tenant_ops')
    OR has_role(auth.uid(),'landlord_ops')
  );

CREATE POLICY "Ops staff and executives can update advance requests"
  ON public.agent_advance_requests FOR UPDATE
  USING ( /* same role list as above */ );
```

(I'll first verify the exact role enum values — `agent_ops` / `tenant_ops` / `landlord_ops` — from `app_role` and `staff_permissions` before writing the final migration. If the project uses `staff_permissions` rows instead of distinct `app_role` enums for these, I'll switch to a `EXISTS (SELECT 1 FROM staff_permissions ...)` predicate.)

### Part C — Detect "0 rows updated" as failure (defensive)

In `AdvanceRequestsQueue.tsx`, change the update to request the affected row back and treat empty results as a hard error so future RLS gaps can never silently swallow approvals again:

```ts
const { data, error } = await supabase
  .from('agent_advance_requests')
  .update(updateData)
  .eq('id', id)
  .select('id')
  .maybeSingle();
if (error) throw error;
if (!data) throw new Error('Approval blocked — your role may not have permission, or the request has already moved.');
```

---

## Files touched

1. `src/components/financial-ops/FinOpsWithdrawalVerification.tsx` — surface real errors in `handleApprove` / `handleReject`
2. `src/components/agent/AgentCashPayoutsTab.tsx` — surface real errors in `completeWithdrawal`
3. `src/components/financial-ops/ApprovalQueue.tsx` — surface real errors in the bulk approve loop
4. `src/components/ops/AdvanceRequestsQueue.tsx` — return-row check + clearer error
5. New migration — extend RLS on `agent_advance_requests` for `agent_ops` / `tenant_ops` / `landlord_ops`

After deploy: every failed Approve click will now show the **actual reason** in the toast (insufficient balance, wrong stage, no permission, etc.) instead of disappearing silently, and the three ops-stage roles will actually be able to advance requests through the pipeline.

