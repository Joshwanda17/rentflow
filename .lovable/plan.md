## Goal
Add a visible "Cancel" action in the COO / Partner Operations partner-portfolio card so staff can cancel a parked / pending next-ROI top-up. The backend already supports it — only the UI button + confirmation dialog are missing.

## Background (what's already there)
- Edge function `cancel-pending-topups` already exists. It:
  - Requires `portfolio_id` and a `reason` (≥10 chars).
  - Cancels all `pending_wallet_operations` rows where `status = 'approved'` (i.e. the parked top-ups awaiting merge into principal — what the user calls "pending next ROI top-up").
  - Refunds the partner wallet via balanced ledger entries, writes an audit log, and notifies the partner.
- The Manager screen (`InvestmentAccountsManager.tsx`) already wires this function up.
- In `COOPartnersPage.tsx` the same data is loaded into `approvedTopUps[p.id]` (lines 805–825), and the existing **Apply Top-up** button at line 2142 is rendered exactly when `approvedTopUps[p.id]?.total > 0` — but there is no Cancel sibling.

## Changes (single file: `src/components/coo/COOPartnersPage.tsx`)

1. **State + handler**
   - Add `cancelDialogPortfolioId`, `cancelReason`, `cancellingTopUp` state (mirror of the Manager view).
   - Add `handleCancelPendingTopUps()` that calls `supabase.functions.invoke('cancel-pending-topups', { body: { portfolio_id, reason } })`, toasts the result, closes the dialog, and refreshes the partner detail via `openPartnerDetail(detailPartner.profile.id)`.

2. **New "Cancel" button in the actions row (line 2049 div)**
   - Render right next to the existing **Apply Top-up** button (line 2142–2151), gated by the same `!readOnly && approvedTopUps[p.id]?.total > 0` condition.
   - Style: `variant="ghost"`, destructive red (`text-destructive hover:text-destructive hover:bg-destructive/10`), `Ban` icon (already imported), label: `Cancel Top-up` with the parked total in a small badge, e.g. `Cancel Top-up ({formatUGX(approvedTopUps[p.id].total)})`.
   - `onClick` opens the confirmation dialog by setting `cancelDialogPortfolioId = p.id`.

3. **Confirmation `AlertDialog`** (placed near the existing merge dialog)
   - Title: "Cancel Pending Top-Up?"
   - Body: shows the parked amount and op count, warns the funds will be refunded to the partner wallet and the next ROI cycle will not include this principal.
   - Required `Textarea` for `cancelReason` (min 10 chars; submit disabled until met).
   - Footer: `Cancel` (close) + `Confirm Cancel` (calls `handleCancelPendingTopUps`, shows spinner while `cancellingTopUp`).

4. **No backend / DB changes** — the edge function and ledger plumbing are already in place.

## Acceptance
- In COO → Partners → open a partner → if a portfolio has parked (approved-but-not-merged) top-ups, an obvious red **Cancel Top-up** button appears in the actions row alongside Edit / Top Up / Renew / Delete / Apply Top-up / Compound.
- Clicking it opens a confirmation dialog requiring a 10+ character reason.
- On confirm: parked ops flip to `cancelled`, the partner wallet is refunded, the partner card refreshes, and both **Apply Top-up** and **Cancel Top-up** disappear (because `approvedTopUps[p.id]` is now empty).