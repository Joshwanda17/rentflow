# Change "Pay to Wallet" to a Two-Option "Pay" Flow in Nearing Payouts Dialog

## What Changes

Replace the single "Pay to Wallet" button with a "Pay" button that reveals two options: **Pay to Wallet** and **Already Paid**. After selecting an option, the user enters the audit reason, submits, and the item shows as **Pending** (instead of immediately "Paid"). Financial Ops then approves/completes it from their Approval Queue.

## Current Flow

- COO or partner Ops clicks "Pay to Wallet" → creates `pending_wallet_operations` entry → shows "✓ Paid"

## New Flow

1. User clicks **Pay** → a dropdown/popover appears with two choices:
  - **Pay to Wallet** — ROI amount will be credited to partner's wallet (pending approval)
  - **Already Paid** — payment was already made externally (just log it for records)
2. After selecting, the reason textarea becomes visible (or stays visible) with a note showing the selected payment type
3. User enters reason (min 10 chars) and confirms
4. Item shows **⏳ Pending** badge (yellow) instead of "✓ Paid"
5. Both options create a `pending_wallet_operations` entry with:
  - `operation_type`: `roi_wallet_credit` (Pay to Wallet) or `roi_already_paid` (Already Paid)
  - `status`: `pending`
6. Financial Ops sees these in their Approval Queue and can approve/complete them
7. All actions are logged to `audit_logs` and `notifications`

## Implementation

### File: `src/components/coo/COOPartnersPage.tsx` (NearingPayoutsDialog)

**State changes:**

- Add `payMode` state: `Record<string, 'wallet' | 'already_paid' | null>` to track which pay option was selected per portfolio
- Change `completed` state to support a `'pending'` value alongside `'compounded'`

**UI changes (lines ~2786-2807):**

- Replace the "Pay to Wallet" button with a "Pay" button
- When "Pay" is clicked, show two sub-buttons: "Pay to Wallet" and "Already Paid"
- Once a mode is selected, highlight the choice and enable the confirm/submit flow
- After submission, show a **⏳ Pending** badge (amber/yellow) instead of "✓ Paid"

**Logic changes (handlePay function, lines ~2613-2687):**

- Accept a `mode` parameter (`'wallet' | 'already_paid'`)
- Set `operation_type` based on mode:
  - `'wallet'` → `roi_wallet_credit`
  - `'already_paid'` → `roi_already_paid`
- Description includes the payment mode for audit clarity
- Audit log `action_type` differentiates: `roi_payout_requested` vs `roi_already_paid_logged`
- After success, set completed state to `'pending'` instead of `'paid'`

**Badge display (lines ~2738-2745):**

- Add `'pending'` state rendering with amber badge: "⏳ Pending Approval"
- Keep `'compounded'` badge as-is (green "✓ Compounded")

### File: `src/components/financial-ops/ApprovalQueue.tsx`

- No changes needed — wallet ops with `status: 'pending'` already appear in the queue
- The existing approve flow handles `pending_wallet_operations` generically

### Files Modified

- `src/components/coo/COOPartnersPage.tsx` — NearingPayoutsDialog: new pay mode selection UI, updated handlePay logic, pending badge state
- All this is done in the Coo dashboard and partner Ops dashboard