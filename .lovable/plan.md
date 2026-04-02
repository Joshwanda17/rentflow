

# Gate Angel Pool Tab Behind Agreement Acceptance

## Overview
When a user taps the "Angel Pool" tab in Capital Opportunities, check if they've already accepted the Angel Pool Agreement. If not, show the agreement in a modal/sheet first. Only after acceptance should the Angel Pool tab content be revealed.

## Changes

### 1. Edit `src/components/angel-pool/CapitalOpportunityEntry.tsx`
- Import `useAngelPoolAgreement` hook and `useNavigate` from react-router-dom
- Import the agreement content and a new inline agreement dialog component
- Intercept the Angel Pool tab switch: in the `Tabs onValueChange` handler (line 530) and in `handlePoolSelect` (line 460), check `isAccepted` from the hook
- If not accepted, instead of switching to the angel tab, open a dialog/sheet showing the agreement with an "I Agree" button
- Once accepted (via the hook's `acceptAgreement`), proceed to show the Angel Pool tab content
- Add state: `showAgreementDialog` (boolean)

### 2. Create `src/components/angel-pool/agreement/AngelPoolAgreementDialog.tsx`
- A reusable dialog component that shows the agreement text in a scrollable sheet
- Props: `open`, `onAccept`, `onClose`, `isLoading`
- Uses the existing `ANGEL_POOL_AGREEMENT_TEXT` content
- Has a single "I Agree — Accept & Sign" button at the bottom
- Professional styling consistent with the app

### Files Changed

| File | Action |
|------|--------|
| `src/components/angel-pool/agreement/AngelPoolAgreementDialog.tsx` | Create — modal with agreement text + accept button |
| `src/components/angel-pool/CapitalOpportunityEntry.tsx` | Edit — gate angel tab behind agreement check |

