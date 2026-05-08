## Root cause

The Landlord Ops "Force Approve" button calls the DB RPC `force_approve_rejected_rent_request`, which inserts a `system_events` row with `event_type = 'rent_request.force_approved'`. That value is **not** in the `system_event_type` enum, so Postgres aborts the whole transaction:

> invalid input value for enum system_event_type: "rent_request.force_approved"

The status update, audit log, and event emission all roll back together — so the request stays `rejected` and the UI shows "Action failed".

Existing enum entries use underscores (`rent_request_approved`, `rent_request_funded`, etc.); only this one uses a dot, which is the inconsistency that caused it to be missed.

## Fix (single migration, no UI change)

1. Add the missing enum value to `public.system_event_type`:
   - `rent_request_force_approved` (underscore form, matches the family)
2. Update `public.force_approve_rejected_rent_request(...)` to emit `'rent_request_force_approved'` instead of the dotted string. All other logic (role gate, 10-char reason check, stage advancement, audit log, TID requirement when advancing to `funded`) stays exactly the same.

No frontend or edge-function changes are needed. The button already calls the right RPC with the right arguments — the failure is purely the enum mismatch inside the function body.

## Verification after apply

- Re-try Force Approve on the same rejected rent request (Kyobula Dorothy, UGX 150,000) with the same justification — it should succeed and advance the request from `rejected` to the next stage based on `rejected_at_stage`.
- Confirm a row appears in `system_events` with `event_type = 'rent_request_force_approved'` and a matching `audit_logs` row with `action_type = 'rent_request_force_approved'`.
