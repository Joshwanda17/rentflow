

# One-Tap USSD Deposit Buttons for MTN MoMo & Airtel Money

## What We're Building

Add "Pay Now" buttons to the deposit dialogs that open the phone dialer with the correct USSD code pre-filled — one tap to start the payment flow, no manual dialing.

## Where to Add

Two dialogs need USSD buttons:

1. **`src/components/wallet/DepositDialog.tsx`** — the main user deposit dialog (shown in screenshot)
2. **`src/components/agent/AgentDepositCashDialog.tsx`** — agent deposit dialog

## Changes

### 1. DepositDialog.tsx — Add "Pay Now" button below the merchant code display (after line 319)

Replace the static "How to deposit" instructions block with a streamlined version, and add a prominent "Pay Now" button below the merchant code card:

- **MTN**: `tel:*165*4%23` (dials `*165*4#`)
- **Airtel**: `tel:*185*9%23` (dials `*185*9#`)

The button will be provider-aware (yellow for MTN, red for Airtel), appear right below the merchant code, and use an `<a href="tel:...">` wrapped in a styled Button. Helper text below: "Tap to open your phone dialer and complete payment instantly."

After tapping, show a subtle info banner: "If payment is complete, scroll down to enter your transaction details."

### 2. AgentDepositCashDialog.tsx — Add USSD quick-dial buttons

Same pattern — when MTN or Airtel is selected as the deposit method, show a "Dial Now" button with the appropriate `tel:` link.

### 3. USSD config constant

Add a shared config object (in `DepositDialog.tsx` or a small util):

```typescript
const USSD_DIAL = {
  mtn: 'tel:*165*4%23',    // *165*4#
  airtel: 'tel:*185*9%23', // *185*9#
};
```

## UX Flow

1. User selects provider (MTN/Airtel)
2. Merchant code + "Pay Now" button displayed
3. User taps "Pay Now" → phone dialer opens with USSD code
4. User completes USSD payment on their phone
5. User returns to app → fills in TID, amount, date/time, reason
6. Submits deposit request

## Files Changed

- `src/components/wallet/DepositDialog.tsx` — add Pay Now button below merchant code
- `src/components/agent/AgentDepositCashDialog.tsx` — add Dial Now button for MTN/Airtel methods

No database or backend changes needed.

