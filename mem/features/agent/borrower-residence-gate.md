---
name: Borrower Residence Gate for Lending Loan Requests
description: Borrowers must complete a residence profile (linked landlord with GPS + LC1 chairperson) before requesting a lending-agent loan
type: feature
---
Before a borrower can request any lending-agent offer (browse offer "Borrow this offer" OR direct request by AI ID) in `BorrowLoanSheet.tsx`, they must pass `BorrowerResidenceGate.tsx`.

Storage: `profiles.borrower_landlord_id` → `landlords(id)`, `profiles.borrower_lc1_id` → `lc1_chairpersons(id)` (both nullable, ON DELETE SET NULL).

Completeness rule (`isResidenceComplete`): linked landlord that HAS latitude+longitude (GPS) AND a linked LC1 chairperson. Landlord/LC1 `verified` is shown as a badge but is NOT a hard block (ops verify later).

The gate shows: landlord name, GPS coords, verification badge, and the registering agent (`landlords.registered_by` → profile full_name). LC1 shows name + verify badge.

Self-service: if the borrower's landlord isn't registered they add it via `LandlordRegistrationForm` (registeredByRole='tenant', captures GPS). If their LC1 isn't listed they add one inline → inserts `lc1_chairpersons` with `registered_by=auth.uid()`, `verified=false`.

RLS: added policy "Users can insert their own lc1" on `lc1_chairpersons` (WITH CHECK registered_by = auth.uid()) so non-agent borrowers can self-add LC1. Borrowers update their own profile links via the existing "Users can update own profile" policy.

Borrower-facing loan form never shows this requirement to the lender; it's a pre-request gate on the borrower side only.
