## What's already in place (don't rebuild)

The 2× vouch math you described is **already wired end-to-end**:

- DB constants: `welile_agent_vouch_multiplier()` returns **2**, floor **UGX 100,000**, cap **UGX 30M**.
- `agent_collections` has a trigger (`trg_recompute_agent_vouch_on_collection`) that calls `recompute_agent_earned_vouch` on every insert and writes an audit row to `agent_vouch_limit_history` with `previous_effective_limit_ugx`, `new_effective_limit_ugx`, `delta_ugx`.
- `welile_trust_score_cache.agent_earned_vouch_ugx` updates in the same transaction.
- The agent dashboard already renders `AgentVouchHighlightCard` ("Welile Vouches For You — Up to UGX X") with an expandable breakdown and `AgentVouchHistoryFeed`.

What's **missing** is the **celebration moment** the instant the collection is recorded, plus stronger "this is the #2 trust pillar" framing on the surfaces lending agents look at.

## What to build

### 1. Celebration moment in `RecordAgentCollectionDialog` success view

When `validate_and_record_collection` returns successfully, before showing today's existing summary, fetch the latest `agent_vouch_limit_history` row for this collection and show a one-screen celebration:

```text
┌────────────────────────────────────┐
│        ✨  WELILE VOUCHED  ✨       │
│                                    │
│            +UGX 2,000              │  ← animated count-up, emerald
│      added to your vouch limit     │
│                                    │
│   New limit: UGX 152,000           │
│   ──────────────────────────       │
│   You collected UGX 1,000          │
│   Welile vouched 2× = UGX 2,000    │
│                                    │
│   Trust Score #2 priority          │
│   (after Supporter Portfolio)      │
│                                    │
│   [ See my vouch ]   [ Done ]      │
└────────────────────────────────────┘
```

Implementation:
- Poll `agent_vouch_limit_history` filtered by `collection_id` (returned by the RPC) up to ~1.5s with small backoff. The trigger runs in-transaction so the row is normally already there on the first read.
- If `delta_ugx > 0` show the celebration; if `metadata.capped = true`, show a "You've reached the UGX 30M vouch ceiling — top tier" variant.
- Reuse `useAppPreferences().celebrations` gate (same one used by first-transaction celebration) for confetti + heavy haptics, so users who opted out aren't surprised.
- Keep the existing summary (amount, method, float before/after) as a secondary panel below the celebration.

### 2. Trust pillar ranking — make priority #2 explicit

Update `AgentVouchHighlightCard`'s expanded section with a small ranked list driven from `welile_trust_score_cache.breakdown`:

```text
TRUST PILLARS (in order of weight)
1. Supporter Portfolio
2. Rent Collection (you) ⬅ active
3. Verification & GPS
4. Wallet behaviour
```

This reframes the card as "Welile takes rent collectors seriously — second only to Supporters."

### 3. Lending-agent panel: show borrower's Welile-vouched amount

In `LendingAgentsPanel.tsx`, when a lender opens a borrower agent, surface a "Welile vouches **UGX X** for this agent — earned from **UGX Y** in collected rent (2×)" badge. Pull `borrowing_limit_ugx` and `agent_earned_vouch_ugx` from `welile_trust_score_cache`. This makes the lending decision concrete: lenders see *why* Welile trusts the agent.

### 4. Public trust profile (`/profile/WEL-XXXXXX`)

Add a "Welile Vouch" stat tile next to the existing trust score in `HolisticProfile.tsx`, with the breakdown (base 100k + earned). Data is already public via `get_public_trust_profile`.

### 5. Realtime invalidation

After collection recording, invalidate `useTrustProfile` and the `get_agent_vouch_limit_ugx` query so `AgentVouchHighlightCard` updates without a manual reload.

## Technical details

**Files to edit / create**
- `src/components/agent/RecordAgentCollectionDialog.tsx` — insert the celebration screen between submit success and the existing summary; fetch `agent_vouch_limit_history` by `collection_id`.
- `src/components/agent/CollectionVouchCelebration.tsx` (new) — count-up, gradient, haptics, confetti gated by user prefs.
- `src/components/agent/AgentVouchHighlightCard.tsx` — add the 4-row "Trust Pillars" block at the top of the expanded section.
- `src/components/executive/LendingAgentsPanel.tsx` — add a `WelileVouchBadge` per row and in the borrower detail sheet.
- `src/pages/HolisticProfile.tsx` — add a "Welile Vouch" stat tile.

**Backend**
- `validate_and_record_collection` RPC: confirm it returns `collection_id` in the JSON payload. If not, add it (one-line `jsonb_set`). The trigger creates the `agent_vouch_limit_history` row in the same transaction so the client read is race-free.
- No new tables, no new triggers, no change to the multiplier/cap. The 2× math is already locked in.

**Constraints respected**
- No frontend ledger writes — celebration is a pure read of `agent_vouch_limit_history`.
- Haptics + confetti gated by `useAppPreferences`.
- UGX-only formatting via `formatUGX`.
- Strict terminology: "Rent Plan", "Supporter" (not "Lender") in user-facing copy. Internal table names stay as-is.

## Out of scope

- Changing the 2× multiplier or UGX 30M cap.
- Building the lending-agent loan-creation flow (already exists in `LenderRecordLoanCard`).
- Trust-score weight changes — the "#2 pillar" framing is presentational; the actual weights live in `recompute_trust_score` and are not modified here.
