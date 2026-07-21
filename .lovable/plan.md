## Shareable Employee Requisition Links (CFO-managed)

Public link an employee opens (no login) → submits requisition → lands as **Pending CFO Approval** in the CFO Financial Ops → Requisitions tab.

### Database (new migration)

**`requisition_links`** — CFO-issued tokens
- `id`, `token` (64-char random, unique), `created_by` (uuid), `department` (text, nullable), `label` (text, nullable)
- `expires_at` (timestamptz, nullable), `max_submissions` (int, nullable), `submission_count` (int, default 0)
- `is_active` (bool, default true), `revoked_at`, `created_at`, `updated_at`
- RLS: CFO/super_admin can select/insert/update their own; no anon access. Grants to `authenticated` + `service_role` only.

**`employee_requisitions`** — public submissions
- `id`, `link_id` (fk), `employee_name`, `employee_id` (nullable), `department`, `employee_phone`, `employee_email`
- `purpose`, `category`, `amount` (numeric), `currency` (default 'UGX'), `priority` (low/normal/high/urgent)
- `required_by` (date), `description`, `attachment_urls` (text[])
- `status` (pending/approved/rejected/paid/cancelled, default 'pending')
- `submitted_at`, `submitter_ip` (text), `approved_by`, `approved_at`, `rejection_reason`, `created_at`, `updated_at`
- RLS: no direct anon access. Only CFO/super_admin can read/update. Inserts go through edge function using `service_role`.
- Grants: `SELECT, UPDATE ON ... TO authenticated`; `ALL ... TO service_role`.

**Storage bucket** `requisition-attachments` (public read of signed URLs only; uploads via edge function).

### Edge functions

- `requisition-link-validate` (public, no JWT) — `GET ?token=...` → returns `{ valid, label, department, expires_at }` or error.
- `requisition-submit` (public, no JWT) — validates token, checks `expires_at`, `is_active`, `max_submissions`; accepts JSON body + already-uploaded attachment paths; inserts row; atomically increments `submission_count`; emits `system_events` (`requisition.submitted`); triggers `create-notification` for all CFO users; returns `{ ok: true, id }`. Rate-limits per-IP (max 5/hour) using an in-memory bucket table or check on `submitter_ip` in last hour.
- `requisition-upload` (public) — accepts multipart file (max 10MB, allowlist mime pdf/jpg/png/webp), stores in `requisition-attachments/<token>/<uuid>-<name>`, returns path.
- `requisition-decide` (authenticated CFO) — approve/reject, writes `approved_by`, `approved_at`, or `rejection_reason`; sends SMS via Yoola (omit sender) + email to employee.

### CFO UI

Add a **Requisitions** tab (or panel inside existing Financial Ops Command Center) with two sections:

1. **Shareable Links** panel (`RequisitionLinksPanel.tsx`)
   - "Generate link" dialog: label, optional department, expires_at (date picker, default 30d), optional max_submissions.
   - Table of links: label, URL preview, expires, submissions used/limit, active state.
   - Actions per row: **Copy**, **Share on WhatsApp** (opens `https://wa.me/?text=...`), **Revoke**, **Regenerate token**.

2. **Pending Requisitions Queue** (`EmployeeRequisitionsQueue.tsx`)
   - Filter by status (default pending). Columns: employee, dept, amount (formatUGX), purpose, submitted_at.
   - Row expand shows description + attachment links (signed URLs).
   - **Approve** (confirmation) and **Reject** (requires 10-char reason) buttons calling `requisition-decide`.
   - Optional: forward-to-finance handoff simply flips status to approved (existing finance workflow reads approved list).

### Public page

`/requisition/new?t=<token>` — new route `src/pages/PublicRequisitionForm.tsx`
- On mount calls `requisition-link-validate`; shows friendly expired/inactive/exhausted screen when invalid.
- Form (zod-validated): all fields listed in spec, with attachment uploader (calls `requisition-upload`).
- On submit → `requisition-submit` → success screen with reference ID.

### Notifications

- New submission → row inserted in `notifications` for every user with CFO role, plus optional SMS to CFO phone(s).
- Decision → email + SMS to employee (email required in form; phone optional).

### Security

- 32-byte random tokens (base64url, ~43 chars) via `crypto.getRandomValues` in edge; DB has UNIQUE constraint.
- No sequential IDs in URL.
- File allowlist + 10MB size cap enforced server-side.
- Per-IP + per-token rate limiting.
- Audit log entry in `audit_logs` on generate/revoke/approve/reject with 10-char reason.

### Files

New:
- `supabase/migrations/<ts>_employee_requisitions.sql`
- `supabase/functions/requisition-link-validate/index.ts`
- `supabase/functions/requisition-submit/index.ts`
- `supabase/functions/requisition-upload/index.ts`
- `supabase/functions/requisition-decide/index.ts`
- `src/pages/PublicRequisitionForm.tsx` + route in `App.tsx`
- `src/components/financial-ops/RequisitionLinksPanel.tsx`
- `src/components/financial-ops/EmployeeRequisitionsQueue.tsx`

Updated:
- `src/components/financial-ops/FinancialOpsCommandCenter.tsx` — mount the two new panels under a Requisitions tab.
- `src/App.tsx` — add the public route.

No existing wallet/ledger logic is touched; requisitions become ledger transactions only after CFO approves and (separately) Finance processes payout — reusing the current finance queue.
