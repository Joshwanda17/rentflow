# LOLEM FIRICILA — wallet investigation

## What the screen shows
- Withdrawable: **UGX 1,897,133**
- Float (owed): **UGX 602,406**
- Cached `wallets.balance`: 2,499,539 (= withdrawable + float)

## What the ledger says (truth)
Running `get_user_available_balance(user)` (the strict rule + post-anchor window) returns:

- **Strict available: UGX 313,500**

So the card is overstating withdrawable by **~UGX 1,583,633**.

The user has a fresh-start anchor row (created 2026-04-29 from the system-wide hybrid backfill) with `pre_anchor_ledger_net = -4,533,078`. The ledger window is therefore narrowed to entries on/after `2026-04-28 21:00 UTC`. Inside that window the wallet-scope production net is small (≈ 313K), which is exactly what the strict RPC returns.

The cached `withdrawable_balance = 1,897,133` was carried over from before the anchor and was never reconciled against the post-anchor ledger. Per the "Wallet Withdrawable Strict Rule", any withdrawal attempt is already gated to 313,500 — so the user **cannot actually withdraw** the 1.9M they see, and (good news) the approval edge function will not pay it out either.

## Recent withdrawal activity (sanity)
Last 20 requests are all small (20K–100K). Only one cancelled (313K, 2026-04-29) and many rejected. No oversized payouts ever cleared. So the cache drift is purely **display drift**, not a financial loss.

## Root cause
1. Pre-anchor era, this agent accumulated heavy negative drag (-4.5M) from `agent_repayment`, `agent_float_settlement`, `wallet_deduction`, `agent_float_used_for_rent`, etc.
2. The 2026-04-29 fresh-start anchor neutralized that drag for *ledger window* purposes, but the **cached `wallets.withdrawable_balance` was not reset** — it still reflects the pre-anchor optimistic cache.
3. The split wallet card (`UnifiedWalletHeroCard` agent layout) reads cached buckets directly for "Withdrawable" and "Float (owed)", instead of clamping to `get_user_available_balance` like the non-split headline does.

So two distinct bugs combine:

- **A. Display bug** (UI): the agent split layout's "Withdrawable" cell does not honor the strict rule. It should clamp to `get_user_available_balance` exactly like the unified headline already does (per `mem://architecture/wallet-card-strict-headline`).
- **B. Cache drift** (data): for anchored agents, `wallets.withdrawable_balance` was never reseeded against the post-anchor window. There may be other agents in the same state (the 2026-04-29 backfill anchored 34 agents).

## Proposed plan

### Step 1 — UI: clamp the agent split "Withdrawable" cell
In `UnifiedWalletHeroCard.tsx` (and any caller using the split layout, e.g. agent dashboards via `useAgentBalances`), display:

```
displayedWithdrawable = min(cachedWithdrawable, strictAvailable)
```

where `strictAvailable` comes from `useAvailableBalance` (already wired). When `cachedWithdrawable > strictAvailable`, show a small amber "Pending reconciliation — actual withdrawable: UGX X" sub-line, mirroring the existing pending-withdrawal pattern. This guarantees the screen never promises money the system won't pay out.

### Step 2 — Diagnostics: enumerate every drifted agent
Add a CFO-side query (extend `wallet_strict_drift_view` or surface in the existing `PhantomDriftPanel`) that lists agents where `wallets.withdrawable_balance − get_user_available_balance(user) > threshold` AND a `wallet_fresh_start_anchors` row exists. Today this user (and likely most of the 34 anchored agents) will appear there.

### Step 3 — Data: CFO-driven reseed (no silent writes)
Provide a CFO-only edge function `reseed-anchored-withdrawable` that, for an explicitly chosen user, posts a single ledger-balanced `system_balance_correction` entry to bring `wallets.withdrawable_balance` down to `get_user_available_balance`. The over-cached delta is logged into `wallet_historical_drift_review` (already used by the 2026-04-29 backfill) so the CFO can release or write down the difference per-agent.

For LOLEM FIRICILA specifically: post `1,897,133 − 313,500 = 1,583,633` as a `system_balance_correction` cash_out on the wallet leg (matching cash_in on `wallet_phantom_writedown` on the platform leg) — only after CFO clicks "Reconcile" in the panel.

### Step 4 — Memory
Update `mem://architecture/wallet-card-strict-headline` to record that the agent split layout now also honors the strict rule (today only the non-split headline does), and add a note to `mem://architecture/wallet-baseline-anchor` that anchored agents need cached-bucket reconciliation as a follow-up.

## What I will NOT do without your sign-off
- I will not silently rewrite this user's `wallets.withdrawable_balance` to 313,500. The 1.58M delta needs an explicit CFO decision (release / writedown).
- I will not auto-reconcile the other 33 anchored agents. The diagnostic panel surfaces them; CFO chooses one-by-one.

## Technical notes
- Strict RPC: `get_user_available_balance('e4f07815-7991-422f-946f-7f351b38e954')` → **313,500**
- Anchor: `2026-04-28 21:00 UTC`, `pre_anchor_ledger_net = -4,533,078`
- Cached buckets: `withdrawable_balance = 1,897,133`, `float_balance = 602,406`, `balance = 2,499,539`
- No oversized payout ever cleared — financial integrity intact; this is a display + cache hygiene issue only.
- Files to touch: `src/components/wallet/UnifiedWalletHeroCard.tsx`, `src/hooks/useAgentBalances.ts`, new edge function `supabase/functions/reseed-anchored-withdrawable/index.ts`, CFO panel (`PhantomDriftPanel` or sibling).
