

## Change: Send "Investment Partnership Confirmation" email on every new investment portfolio

### Current behavior

In `supabase/functions/fund-rent-pool/index.ts`, the partnership confirmation email is gated to **first-time investors only** — it checks `existingPortfolio` and only fires if the user had no prior portfolio. The idempotency key is per-user (`partnership-agreement-{user.id}-{referenceId}`), but the gating condition prevents subsequent sends.

### New behavior

Send the confirmation email **every time a new investor portfolio is created** for the user (i.e. every successful `Fund` action that opens a fresh portfolio row in `investor_portfolios`). Mid-cycle top-ups that get parked in `pending_portfolio_topup` (and therefore do NOT create a new portfolio row) will NOT trigger the email — they're not a new partnership, just an addition to an existing one.

### Implementation

**File: `supabase/functions/fund-rent-pool/index.ts`**

1. Remove the `existingPortfolio === null` first-investment gate around the email-send block.
2. Replace it with a check on the actual outcome of this transaction: only send when the function path created a **new `investor_portfolios` row** in this run (not when it routed the funds into `pending_portfolio_topup` as a mid-cycle top-up).
   - Capture a boolean like `portfolioCreatedThisRun` from whichever branch inserts into `investor_portfolios`.
   - `if (portfolioCreatedThisRun) { ...send email... }`
3. Keep the idempotency key tied to the new portfolio's reference / id so each distinct portfolio gets exactly one email and retries are still safe:
   - `idempotencyKey: `partnership-agreement-${user.id}-${newPortfolioId}``
4. All template data (`partner_name`, `partnership_amount`, `contribution_date`, `monthly_return_amount`, `total_projected_return`, `first_payment_date`, `roi_payment_day`, `dashboard_url`) continues to be derived from the funded `amount` and the new portfolio's timestamps — no template changes needed.

### Result

- Funder funds tenant for the first time → new portfolio created → email sent. ✅
- Same funder funds another tenant later (new portfolio) → email sent again. ✅
- Same funder tops up an existing active portfolio mid-cycle (parked in `pending_portfolio_topup`, no new portfolio row) → email NOT sent. ✅
- Retries of the same fund call → idempotency key prevents duplicates. ✅

### Files touched

- `supabase/functions/fund-rent-pool/index.ts` — swap the first-investment gate for a "portfolio created this run" gate; update idempotency key to include the new portfolio id.

No template, schema, or UI changes required.

