

User chose **Option A**: collapse paired ledger legs into a single approval card in the Financial Ops queue.

## Investigation needed first
I need to find:
1. The Financial Ops approval queue component (where the duplicate cards render)
2. The `pending_wallet_operations` data structure — what field links the deposit + withdrawal legs (likely a shared `reference_id`, `metadata.topup_id`, `idempotency_key`, or `metadata.event_group_id`)
3. The function that creates the paired rows (so we understand the linkage we can group on)
4. The approve/reject handlers (so we can make them act atomically on both legs)

## Approach (UI-only collapse, per Option A)
- Group `pending_wallet_operations` rows on the client by their pairing key (whichever field reliably links the two legs of a single business event)
- Render **one merged card** per group showing: business event type (PORTFOLIO TOP-UP), partner, portfolio code, **Source (debit) → Destination (credit)** with both amounts visible
- Single Approve / Reject pair of buttons that calls the existing approve/reject handler **for both leg IDs in sequence** (or in one batch), sharing the same audit reason
- Solo (unpaired) operations keep rendering as today
- No DB schema changes (Option A is the pure UI collapse). If the linkage field doesn't exist, fall back to grouping by `(amount, created_at within 2s, related_entity_id, partner)` heuristic and flag any unpaired half-leg as a warning card

## Files I expect to touch
- The Financial Ops queue component(s) under `src/components/financial-ops/` or `src/pages/FinancialOps*.tsx` (will locate)
- The hook/query that fetches `pending_wallet_operations` (add grouping logic)
- The approve/reject action handler (loop over both leg IDs atomically — both succeed or rollback)

## Out of scope (would be Option B)
- Changing the edge function that creates the rows
- Adding a new `event_group_id` column
- Changing the underlying double-entry ledger logic

Let me start by locating the Financial Ops queue files and inspecting the data shape.

