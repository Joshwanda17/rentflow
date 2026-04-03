

## Manual TID Verification Pop-Up for Deposit Approval

### What Changes

**1. Add a Deposit Verification Dialog to ApprovalQueue.tsx**

When a manager taps a deposit item in the queue, instead of just opening the detail sheet, a dedicated **verification pop-up** appears showing:
- User's full name and phone
- Full Transaction ID (not masked)
- Amount in UGX
- Payment provider (MTN/Airtel/Bank/Cash) with badge
- Submission date/time
- Any notes from the user

The dialog has two actions:
- **Approve** — validates TID format first, then calls `approve-deposit` edge function
- **Reject** — requires a 10-character minimum reason, updates status to `rejected`

**2. TID Format Validation Gate Before Approval**

Before the Approve button is enabled, the system validates:
- MTN deposits: TID must start with `MP`
- Airtel deposits: TID must start with `TID`
- If format is invalid, show inline error: "Invalid TID format for [provider]. MTN TIDs must start with 'MP'." and block the approve button
- Bank and Cash deposits skip TID format validation (different reference formats)

**3. Remove "Review only" Restriction on Deposits Tab**

Currently deposits show "Review only — approve via TID" and hide approve/reject buttons. This changes to:
- Each deposit card gets **Approve / Reject** buttons (same as withdrawals)
- Tapping either button opens the verification dialog with the selected action pre-set
- The TID Verification tab remains as an alternative bulk search tool

**4. Audit Logging on Every Verification Action**

Every approve/reject from the dialog inserts an `audit_logs` entry with:
- `action_type`: `deposit_manual_approve` or `deposit_manual_reject`
- `metadata`: full TID, amount, provider, user name, rejection reason (if any)
- Operator's `user_id` as the actor

### Technical Details

| File | Change |
|------|--------|
| `src/components/financial-ops/ApprovalQueue.tsx` | Add `DepositVerificationDialog` state; remove "review only" badge; add approve/reject buttons to deposit cards; wire dialog open on tap; handle approve via `approve-deposit` edge function; handle reject via direct status update; add TID format validation gate |
| No new files | Dialog is inline within ApprovalQueue (uses existing Dialog/Sheet components) |
| No database changes | Existing schema supports all fields needed |
| No edge function changes | `approve-deposit` already handles approval correctly |

### UI Flow (Reference Image Match)

The deposit cards will display similarly to the reference screenshot:
- **Name** (bold, left-aligned)
- **TID** + **provider badge** (mtn/airtel) below the name
- **Date/time** on the next line
- **Amount in UGX** (orange/amber, right-aligned)

When tapped, the verification pop-up overlays with full details and action buttons.

### What Does NOT Change
- TidVerification component remains as-is (alternative search-and-approve tool)
- `approve-deposit` edge function unchanged
- RequestDetailSheet unchanged (still accessible for deeper user context)
- Wallet withdrawals and wallet ops flows unchanged

