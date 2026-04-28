## Investigation summary

Caro (ATUHAIRE CAROLYNE, agent `ae194750-…`) has 195 active proxy partners. Her DB withdrawal queue is healthy — only **1 active pending** withdrawal. The "outdated withdrawals not disappearing" symptom is the **red "Last attempt rejected / expired / cancelled" badge** (and the matching destructive banner with the rejection reason) that keeps showing on partner cards in **Proxy Partner Funds** (`src/components/agent/ProxyPartnerFunds.tsx`) even after Caro has successfully re-requested and the funds have been delivered.

### Root cause

In `loadProxyFunds()` (lines 247–253) the component fetches the most recent **terminal-unpaid** withdrawal per partner (`rejected`, `expired`, `cancelled`) and stores it in `lastTerminalByPartner`. Then in `classify()` (lines 547–556):

```ts
if (partnerWithdrawalStatus[key]) return { kind: 'active' };
const t = lastTerminalByPartner[partner.partnerId];
if (t) return { kind: 'reattempt', terminal: t };  // ← shown forever
return { kind: 'fresh' };
```

The terminal record is shown as "Last attempt rejected" regardless of whether a **later successful** withdrawal (`approved` / `completed` / `fin_ops_approved`) exists for the same partner. Live data confirms many of Caro's partners are in this state, e.g.:

| Partner | Old terminal | After that | Still showing? |
|---|---|---|---|
| JOEL SSEMAKADE | rejected 21 Apr ("Incorrect Figure") | approved 1.235M after | yes — banner stuck |
| RABWONI AMOOTI | rejected 27 Apr | 900k delivered earlier; 4.2M new ROI accrued | yes |
| EUNICE KOMAKECH | … | 7M delivered, 4.7M new ROI | yes if any old terminal |
| BANKO DAVID | rejected previously | 466k delivered + new pending today | yes |

So the partner has been paid and/or the situation is no longer outstanding, but Caro keeps seeing a destructive "Last attempt rejected — funds returned, re-request below" banner that no longer applies. That is what the user is calling "outdated withdrawals not disappearing."

A secondary contributor: the `terminalMap` is built from up to 500 historical rows with no per-partner cutoff, so a 2-week-old rejection wins over the user's mental model of "most recent activity".

## Fix

Make the terminal banner conditional on **"this terminal is more recent than the last successful withdrawal AND more recent than the last active withdrawal for that partner"**.

### Changes to `src/components/agent/ProxyPartnerFunds.tsx`

1. **Capture timestamps for completed and active withdrawals**
   - Add `created_at` / `updated_at` to the `completedRes` query (currently only selects `linked_party, amount, status, reason`).
   - Add `created_at` / `updated_at` to the `activeWithdrawalRes` query.
   - Build `lastSuccessAtByPartner: Record<partnerId, ISOString>` (max of `updated_at` over completed statuses) and `lastActiveAtByPartner` (max over active statuses).

2. **Filter `lastTerminalByPartner` after building it**
   - For each `pid` in `terminalMap`, drop the entry if `terminalMap[pid].at <= max(lastSuccessAtByPartner[pid], lastActiveAtByPartner[pid])`.
   - Rationale: the terminal event has been superseded by a newer successful or in-flight withdrawal — there's nothing for Caro to action.

3. **Guard the banner / badge UI** (lines 674–689 and 712–725)
   - No structural change needed once `lastTerminalByPartner` is filtered, because `classify()` will fall through to `{ kind: 'fresh' }` when no relevant terminal exists.
   - Update the "Awaiting request" copy to make it clear when there is fresh ROI on top of previously delivered funds (e.g. "New ROI accrued — request payout"). Optional polish.

4. **KPI counters** (`reattemptCount`, `freshCount` lines 558–559) and the **filter chips** automatically recompute correctly once `classify()` returns the right kind.

5. **Real-time freshness**
   - The existing `postgres_changes` channel on `withdrawal_requests` already calls `loadProxyFunds()` on any change for `user_id=Caro`, so newly-approved withdrawals will immediately clear stale terminal banners after this fix. No change needed.

### Optional secondary cleanup (same file)

- Limit `terminalRes` to the last 30 days so really old rejections are never resurfaced even if the timestamp comparison logic is bypassed (defense in depth).
- Add a small helper `isTerminalStillRelevant(terminal, lastSuccessAt, lastActiveAt)` so the rule is explicit and unit-testable later.

### Out of scope (verified, no change needed)

- DB integrity is fine: completed withdrawals correctly subtract from per-partner available balance; partnerId derivation via `portfolio.investor_id` matches `withdrawal_requests.linked_party`.
- The cancel-proxy-withdrawal edge function and ledger reversal are working.
- No realtime subscription gap — `proxy-withdrawal-updates` channel is already filtered by `user_id`.

## Acceptance check (manual on Caro's account after deploy)

- Partner cards for JOEL SSEMAKADE, RABWONI AMOOTI, EUNICE KOMAKECH no longer show "Last attempt rejected" because they each have a more recent successful or pending withdrawal.
- Partners whose only history is a rejection (with no later success and no active withdrawal) still show the red banner with the rejection reason — this is the legitimate "needs re-attempt" case.
- The "Re-attempt needed (N)" filter chip count drops to only true outstanding cases.
