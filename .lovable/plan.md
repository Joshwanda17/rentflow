
## COO Nearing Payouts: Convert Pay into a true 2-step in-dialog flow

### What is wrong now
The current implementation does not open a new payment section after clicking **Pay**. It only swaps inline buttons inside the portfolio card. That is why you still “see the same thing”.

### Target UX
Inside the existing **Nearing Payouts** dialog:

1. User sees the portfolio list as usual
2. User enters reason
3. User clicks **Pay**
4. The dialog switches to a new payment section for that selected partner
5. That section shows:
   - Partner name
   - ROI amount
   - payout date / reference summary
   - entered reason
   - managed account status

Then:
- **If managed account**: show info like `Managed account by {AgentName}` and one primary action: **Send to Agent Wallet**
- **If not managed**: show two payment choices: **Pay to Wallet** or **Cash**
- After selection, user confirms and the existing approval/audit flow continues

### Implementation plan

#### 1. Refactor `NearingPayoutsDialog` into 2 views
In `src/components/coo/COOPartnersPage.tsx`:
- Add dialog-level state such as:
  - `selectedPayout`
  - `paymentStep: 'list' | 'payment-options'`
  - `selectedPaymentMode`
  - `managedLookupState`
- Keep the portfolio list as step 1
- Replace the current inline mode buttons under each card with a single **Pay** trigger that opens step 2

#### 2. On Pay click, open a dedicated payment section
When the user clicks **Pay**:
- validate reason first
- snapshot the selected portfolio data
- check managed-account assignment
- switch the dialog to the payment-options section

This section should visually feel separate from the list:
- header with back button
- payout summary card
- managed-status banner
- action buttons beneath

#### 3. Managed-account logic
When loading the payment section:
- query active proxy assignment for that partner
- if `is_managed_account = true`, show:
  - info banner
  - assigned agent name
  - button: **Send to Agent Wallet**
- if not managed, show:
  - **Pay to Wallet**
  - **Cash**

#### 4. Keep existing processing logic, but align labels to the new UX
Reuse the current payout request pipeline:
- wallet payout stays wallet flow
- “already_paid” should be relabeled in UI to **Cash**
- managed payout continues using `target_wallet_user_id`

#### 5. Improve the dialog UX
Make the second section clear and readable:
- top summary block
- reason shown as read-only text
- payment choice cards/buttons
- back button to return to list without losing search state
- loading state while checking managed assignment
- disable confirm while processing

### What is already there
These parts appear to already exist and should be reused:
- managed account assignment in proxy agent manager
- managed payout routing via `target_wallet_user_id`
- pending approval tracking in `pending_wallet_operations`
- audit logging / approval workflow
- managed account lookup logic

### What needs to change
The missing piece is mainly **the UI flow in `NearingPayoutsDialog`**:
- remove inline payment-mode rendering from each portfolio card
- move payment decision into a new dedicated dialog section after Pay is clicked
- rename user-facing “Already Paid” option to **Cash**

### Files to update
- `src/components/coo/COOPartnersPage.tsx` — main refactor for the new 2-step payout dialog

### Technical note
Current code already sets payment options inline under each portfolio card after Pay is clicked. That behavior must be replaced by a dialog-level state transition so the user clearly enters a second payment section instead of staying in the same card view.
