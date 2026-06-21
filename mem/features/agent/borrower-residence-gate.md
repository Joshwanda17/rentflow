---
name: Borrower Residence Gate for Lending Loan Requests
description: Borrowers must complete a residence profile (linked landlord with GPS + LC1 chairperson) before requesting a lending-agent loan
type: feature
---
Before a borrower can request any lending-agent offer (browse offer "Borrow this offer" OR direct request by AI ID) in `BorrowLoanSheet.tsx`, they must pass `BorrowerResidenceGate.tsx`.

Storage: `profiles.borrower_landlord_id` → `landlords(id)`, `profiles.borrower_lc1_id` → `lc1_chairpersons(id)` (both nullable, ON DELETE SET NULL).

Completeness rule (`isResidenceComplete`): linked landlord that is `verified=true` AND has latitude+longitude (GPS), AND a linked LC1 chairperson that is `verified=true`. Loan requests are HARD-BLOCKED until both are verified (pending/rejected both block).

3-state verification status (pending/verified/rejected) is derived per entity: `verified` from `landlords.verified` / `lc1_chairpersons.verified`; otherwise the borrower's own latest row in `landlord_verification_requests` / `lc1_verification_requests` (`requested_by = auth.uid()`) — `status='rejected'` → rejected (shows `reject_comment`), else pending. Rendered via `StatusBadge` (Clock/amber pending, BadgeCheck/emerald verified, XCircle/destructive rejected).

Pending/rejected cards show a "Request verification" button that inserts a `*_verification_requests` row (status pending; handles 23505 unique-pending as "already requested"); ops resolve it in the Landlord Ops dashboard which flips the `verified` flag. The gate shows: landlord name, GPS coords, status badge, and the registering agent (`landlords.registered_by` → profile full_name). LC1 shows name + status badge.

Self-service: if the borrower's landlord isn't registered they add it via `LandlordRegistrationForm` (registeredByRole='tenant', captures GPS). If their LC1 isn't listed they add one inline → inserts `lc1_chairpersons` with `registered_by=auth.uid()`, `verified=false`.

RLS: added policy "Users can insert their own lc1" on `lc1_chairpersons` (WITH CHECK registered_by = auth.uid()) so non-agent borrowers can self-add LC1. Borrowers update their own profile links via the existing "Users can update own profile" policy.

Borrower-facing loan form never shows this requirement to the lender; it's a pre-request gate on the borrower side only.
