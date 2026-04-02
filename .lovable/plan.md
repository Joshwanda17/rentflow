

# Add Audit Reason Textarea to Payout & Top-Up Actions

## Problem
The **Compound**, **Pay to Wallet**, and **Top-Up** actions in the COO Partners section proceed without requiring a reason. For audit compliance, each action needs a mandatory reason field with the placeholder: *"Include reason and phone number or A/C"*.

## Changes

### 1. `src/components/coo/COOPartnersPage.tsx` — NearingPayoutsDialog

**Add per-portfolio reason state:**
- Add `reasons` state: `Record<string, string>` keyed by portfolioId
- Add a `<Textarea>` above each portfolio's action buttons with placeholder `"Include reason and phone number or A/C"`
- Disable Compound/Pay buttons until the reason has at least 10 characters

**Pass reason into handlers:**
- `handleCompound`: include `reason` in the audit_logs metadata and ledger description
- `handlePay`: include `reason` in the pending_wallet_operations description and audit_logs metadata

### 2. Top-Up submission (if initiated from COO Partners page)

Search for the top-up submission handler in `COOPartnersPage.tsx` and add the same `<Textarea>` requirement with the same placeholder before the top-up action can proceed.

### 3. `src/components/cfo/PendingPortfolioTopUps.tsx` — Display reason

If the reason is stored in the `description` or `metadata` field, display it in the top-up list so CFO reviewers can see it.

## UI Preview
Each portfolio card in the Nearing Payouts dialog gets a textarea between the stats grid and the action buttons:

```text
┌─────────────────────────────────┐
│  Partner Name         3d away   │
│  [Principal] [Returns Due]      │
│  [Contrib Date] [Payout Date]   │
│  ┌─────────────────────────┐    │
│  │ Include reason and      │    │
│  │ phone number or A/C     │    │
│  └─────────────────────────┘    │
│  [Compound]    [Pay to Wallet]  │
└─────────────────────────────────┘
```

## Files Modified
- `src/components/coo/COOPartnersPage.tsx` — add reason textarea + validation to NearingPayoutsDialog and top-up flow
- `src/components/cfo/PendingPortfolioTopUps.tsx` — show reason in pending list

