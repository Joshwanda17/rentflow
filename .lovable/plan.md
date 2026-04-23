

# Add `partner-compound` confirmation email

## What you'll get

When a partner's portfolio compounds (their monthly Returns are auto-reinvested into the principal instead of paid to wallet), the partner automatically receives the new HTML email you uploaded — branded, mobile-responsive, with all values formatted in UGX.

## Where compounding happens today

Compounding is a single code path in our system:

- File: `supabase/functions/process-supporter-roi/index.ts`
- Branch: when a portfolio has `auto_reinvest = true`, the cron credits the Returns back into `investor_portfolios.investment_amount` (the `shouldReinvest` block, lines ~138-192) instead of crediting the wallet.
- Both COO/Partner-Ops-set and partner-self-toggled compounding flow through this same branch (`supporter-account-action toggle_roi_mode` just flips the flag; the actual compounding event is this cron run).

So we need exactly **one new email trigger**, in that one branch.

## Files to add / change

### 1. NEW — `supabase/functions/_shared/transactional-email-templates/partner-compound.tsx`
Convert your `partner_compound.html` into a React Email component (same pattern as the existing `partnership-topup.tsx`). All `{{Placeholders}}` become typed props:

| HTML placeholder | Prop | Formatting |
|---|---|---|
| `{{PartnerName}}` | `partner_name` | string, defaults to "Partner" |
| `{{PortfolioID}}` | `portfolio_id` | short code, e.g. `PF-1A2B3C4D` |
| `{{CompoundDate}}` | `compound_date` | "20th of April, 2026" (ordinal day) |
| `{{InitialPartnershipAmount}}` | `initial_partnership_amount` | `UGX 5,000,000` |
| `{{ROI_RETURN}}` | `roi_return` | `15%` |
| `{{ReturnAmount}}` | `return_amount` | `UGX 750,000` |
| `{{NewTotalPartnershipValue}}` | `new_total_partnership_value` | `UGX 5,750,000` |
| `{{unsubscribe}}` | `unsubscribe_url` | injected by the email infra |

Export a `template: TemplateEntry` with:
- `displayName: 'Partner Portfolio Compounding Confirmation'`
- `subject: (data) => 'Portfolio Compounded — New Value ' + formatted total`
- `previewData` populated with the sample numbers above

### 2. EDIT — `supabase/functions/_shared/transactional-email-templates/registry.ts`
Register the new template under key `'partner-compound'`.

### 3. EDIT — `supabase/functions/_shared/partnership-emails.ts`
Add a sibling helper next to `buildPartnershipTopupRequest`:

```ts
buildPartnerCompoundRequest({
  recipientEmail, partnerName, partnerId, portfolioId,
  paymentNumber,                // for idempotency
  initialAmount, roiPercentage, returnAmount, newTotal,
  compoundDateIso,
})
```

Idempotency key: `partner-compound-${partnerId}-${portfolioId}-${paymentNumber}` so a single compounding event can never double-send.

### 4. EDIT — `supabase/functions/process-supporter-roi/index.ts`
Inside the existing `if (shouldReinvest) { … }` block, AFTER the ledger write succeeds (right after line 192), add a fire-and-forget email dispatch — same pattern as the Returns Disbursement email already used in the wallet-credit branch (lines 236-260):

- Look up `profiles.email, full_name` for `rr.supporter_id`
- If email exists, call `dispatchTransactionalEmail(...)` with `buildPartnerCompoundRequest({...})`
- Wrap in try/catch — never let an email failure break the ROI loop
- Pass `previousAmount = reinvestInfo.current_amount - roiAmount` (we already mutated it in line 191; we'll capture pre-mutation value just before)

No changes needed to the cron schedule, no DB migration, no new edge function.

## Sending mechanics

The email rides on the existing `send-transactional-email` edge function:
- `Content-Type: text/html` — handled automatically by the email infra
- Unsubscribe token + suppression list — injected by the infra (we just pass `templateName`)
- Resend / SMTP transport — already configured for the other 5 templates

## Out of scope (intentionally)

- No new "manually compound" UI button — there isn't one in the system. Compounding is governed by the `auto_reinvest` flag toggled via `supporter-account-action` (already covered by the cron).
- No retroactive emails for past compounding events.
- `partial-roi-split` does not exist as a function in this repo, despite the memory entry — if/when it's added, it can call the same helper.

## Files touched

- `supabase/functions/_shared/transactional-email-templates/partner-compound.tsx` (NEW)
- `supabase/functions/_shared/transactional-email-templates/registry.ts`
- `supabase/functions/_shared/partnership-emails.ts`
- `supabase/functions/process-supporter-roi/index.ts`

