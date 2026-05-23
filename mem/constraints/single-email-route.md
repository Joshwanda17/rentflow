---
name: Single forward email route per email transaction
description: email_routing_history can hold at most one active forward route per gmail_transaction_id; reversal entries (reason ILIKE 'Reversed%') are exempt and re-open routing
type: constraint
---
- DB trigger `trg_enforce_single_forward_email_route` (BEFORE INSERT on `email_routing_history`) raises `DUPLICATE_EMAIL_ROUTE` (errcode `unique_violation`) when a non-reversal row would be inserted while an unreversed forward route already exists for the same `gmail_transaction_id`.
- Reversal rows are detected by `reason ILIKE 'Reversed%'` — keep that prefix when posting reversals from any new code path.
- Frontend mirrors this in `EmailTransactionsPanel`: "Route to user" and "Debit user wallet" buttons render disabled as "Already routed" when `isRouted && !isReversed`. Reverse button stays enabled.
- **Why:** A single MoMo/email transaction was once routed twice and the duplicate could not be debited back because the second credit had already been spent. The trigger is the hard backstop, the UI gate is UX.
