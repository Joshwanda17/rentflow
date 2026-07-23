## Goal
Let Partner Ops start a new portfolio for an existing partner, email the partner a secure link to complete missing details + sign, and route it through the existing Partner Onboarding approval queue. Financially inert until Ops approves.

## Flow (locked)
```
Ops clicks "Create Portfolio" (existing partner)
  → dialog: enter portfolio details only (amount, tenor, expected return, payout mode, nickname)
  → submit → investor_portfolios row, status = 'awaiting_partner_details' (no ledger, no ROI)
           → completion token generated (7-day, single-portfolio, single-use for submit)
           → email to partner: "Complete your new portfolio" + one-tap link

Partner opens /partners/:partnerId/portfolios/:portfolioId/complete?token=...
  → auth-gated: must be signed in AS that partner (auth.uid() = partnerId) AND email/phone on token matches profile
  → bio prefilled (read-only where present); missing KYC fields required (NIN, next-of-kin, address)
  → portfolio details read-only
  → signature: if partner_agreements.partner_signature_data_url exists → show + "Use this / Re-sign"; else draw
  → submit → profile fields updated (audit-logged), status = 'pending_ops_approval'
           → unstamped signed contract PDF generated (buildAgreementHtml, includeStamp:false)
           → email #2: PDF to partner + partner-ops mailbox

Partner Ops approves in Partner Onboarding queue
  → status = 'active', capital ledger posted, ROI cycle starts
  → stamped final contract (includeStamp:true) → email #3 to partner
```

## DB changes (one migration)
- Extend `investor_portfolios.status` allowed values with `awaiting_partner_details`, `pending_ops_approval`. Add trigger guard: rows in either status must NOT appear in supporter_capital_ledger, roi accrual, or CFO cashflow views (add `.neq('status','awaiting_partner_details').neq('status','pending_ops_approval')` filter to affected views).
- New table `portfolio_completion_tokens`:
  - id, portfolio_id (unique), partner_id, token_hash (sha256, never store raw), email_snapshot, phone_snapshot, expires_at (default now()+7d), consumed_at, created_by, created_at
  - GRANTs: SELECT/UPDATE to authenticated (RLS: partner_id = auth.uid()); ALL to service_role
  - RLS: partner can SELECT/UPDATE own row; no INSERT from client (edge fn only)
- RPCs (all SECURITY DEFINER, search_path=public):
  - `create_pending_portfolio(p_partner_id, p_amount, p_tenor_months, p_expected_return_pct, p_payout_mode, p_nickname)` — inserts portfolio + token, returns { portfolio_id, raw_token }. Auth check: caller must have ops role.
  - `complete_partner_portfolio(p_portfolio_id, p_token, p_profile_patch jsonb, p_signature_data_url text)` — validates token hash, email/phone match, expiry, not consumed; updates profile fields (writes profile_field_audit); flips status; marks token consumed. Returns portfolio_id.
  - `approve_pending_portfolio(p_portfolio_id)` — ops-only; flips to active, posts ledger.
- Retire raw signed-URL exposure: token returned once at creation time, only via edge function.

## Edge functions
- `create-portfolio-invite` — POST from Ops UI. Validates ops role via `adminClient.auth.getUser(token)`, calls RPC, sends email with the completion link containing `?token=<raw>`. Signs the URL includes portfolioId; no partner search UI ever surfaced.
- `submit-portfolio-completion` — POST from partner. Validates JWT belongs to `partner_id`, calls RPC, generates unstamped PDF via existing `buildAgreementHtml` (reuse `agreementTemplate.ts`), emails both parties (Mailgun transport, existing template style).
- `approve-portfolio` — extends existing approval hook to detect `pending_ops_approval` and email stamped contract using existing partner onboarding approval sender.

All three: Zod-validated body, manual `corsHeaders`, structured error `{ error, code, details }` with 400/401/403/404/409/500 as appropriate. UI parses `error` field before showing toast — never raw non-2xx blob.

## Frontend
- New route `/partners/:partnerId/portfolios/:portfolioId/complete` — mobile-first single-column layout, sticky submit CTA, sections collapsible on mobile:
  1. "Welcome, {name}" hero
  2. Portfolio summary (read-only card, brand tokens)
  3. Missing details form (only fields where profile is blank; already-present fields shown read-only with "Update" link)
  4. Signature block (canvas with touch support; reuse existing signature pad component)
  5. Submit
- Access guard on the route:
  - Not signed in → redirect to `/auth?redirect=<current>`
  - Signed in but `auth.uid() !== partnerId` → hard block screen ("This portfolio invite belongs to another account")
  - Token invalid/expired/consumed → dedicated state screen with "Request a new link" (emails Partner Ops, does not self-serve)
- "Create Portfolio" buttons in `COOPartnersPage.tsx` and `PartnersOpsDashboard.tsx` for **existing** partners open the new dialog (portfolio-details only). Brand-new partner flow (`/funder-onboarding`) unchanged.
- Error handling helper `parseEdgeError(err)` in `src/lib/edgeErrors.ts` — reads `FunctionsHttpError.context`, extracts `error` string, falls back to generic message. Every invoke in the new flow uses it.

## Performance / DRY / integrity
- No N+1: partner profile fetched once by the completion page via a single `select(...)` on `profiles` filtered by `id=auth.uid()`; portfolio+token validated server-side in a single RPC round-trip.
- DRY: contract HTML/PDF stays single-source (`agreementTemplate.ts`); email templates for stages 1/2/3 share a common header/footer partial in the edge function.
- No client-side partner search anywhere in this feature — Ops always initiates from a partner row they've already selected in the existing partner list; the completion page reads only the current user's own data.
- Data integrity:
  - `portfolio_completion_tokens.portfolio_id` UNIQUE — one live token per portfolio.
  - Token hashed with SHA-256 at rest; raw token only in the email link.
  - Status transitions guarded by trigger (only ops role can move `pending_ops_approval → active`; only completion RPC can move `awaiting_partner_details → pending_ops_approval`).
  - Portfolios in either pending status excluded from wallet baselines, CFO cashflow, ROI cron, and every user-facing ledger read (respects the "user-facing ledger filter" memory).

## Out of scope for this pass
- Auto-cancel of stale pending portfolios (7-day expiry) — token expires but portfolio stays for Ops to chase manually; add cron in a follow-up.
- KYC staleness gate (>12 months) — assume valid if NIN present; follow-up.
- Self-serve "Add portfolio" button in the partner's own dashboard — Ops-initiated only for now.

## Verification
1. Migration + linter clean.
2. Playwright: sign in as a seeded partner, open a real invite link, confirm auth mismatch blocks, then complete flow, confirm status transitions, confirm PDF email fires.
3. Manual: run the completion RPC with wrong token / expired token / wrong signed-in user; confirm each returns the correct 4xx JSON body.
4. Confirm no direct `wallets` or `general_ledger` writes anywhere in the new code path.

Ready to build on your green light.