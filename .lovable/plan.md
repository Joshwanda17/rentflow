# Redesign MoMo Deposit Flow — Tab-Based Provider Selection

## What Changes

When a funder selects "Mobile Money" to deposit, instead of seeing two separate large cards (MTN and Airtel) that expand awkwardly, they'll see a clean tab-based interface with:

- Two toggle buttons (MTN / Airtel) at the top
- Merchant ID displayed prominently with a copy icon
- Payment steps shown in a vertical timeline style (always visible, compact)
- Amount input with quick-amount buttons
- A "Pay Now" button that only appears after selecting a provider and entering an amount, which dials the correct USSD code with the amount embedded

## Dynamic USSD Dialing

- **MTN**: `tel:*165*3*{amount}%23` — amount is appended into the dial string
- **Airtel**: `tel:*185*9%23` — no amount appended (as per user's instruction)

## Technical Changes

### File: `src/components/payments/DepositFlow.tsx`

Replace the MoMo instructions block (lines 273-304) with a new layout:

1. **Tab buttons** — Two styled toggle buttons for MTN and Airtel (replacing the RadioGroup). Selected tab gets a colored border/background matching the provider brand.
2. **Merchant ID block** — Show the merchant code prominently with a copy icon button next to it. On tap, copies to clipboard with toast confirmation.
3. **Timeline steps** — Replace the collapsible/numbered list with a vertical timeline using a left border line and circular step indicators. Steps are always visible (no collapsible), kept compact with `text-xs`.
4. **Pay Now button** — Move/add a "Pay Now" button that appears only when `amount` is filled. The button constructs the USSD dial string dynamically:
  - MTN: `tel:*165*3*${amount}%23`
  - Airtel: `tel:*185*9%23`
  - Shows a toast reminder with the merchant ID after tapping

### File: `src/components/payments/PaymentPartnerCard.tsx`

No changes needed — this component may still be used elsewhere, but the deposit flow will no longer use it for the MoMo channel.

## Files Changed

- `src/components/payments/DepositFlow.tsx` — redesign MoMo section (lines 273-304 and the Pay Now button logic around line 460)