## What's actually in the database (not what the UI suggests)

I audited every withdrawal request tied to Carol's proxy partners (`ae194750-4827-47e8-839e-5e772565138b`). There are **zero** withdrawal_requests in `pending`, `requested`, `manager_approved`, `cfo_approved`, or `processing` status.

Status breakdown for Carol's partners:

| Status | Count | Total UGX |
|---|---|---|
| approved | 93 | 118,652,862 |
| completed | 13 | 19,772,845 |
| rejected | **34** | **52,995,800** |
| expired | **7** | **6,595,000** |
| cancelled | **1** | **7,520,000** |
| re_approved_for_recovery | 1 | 30,000 |
| **pending / processing** | **0** | **0** |

So nothing is stuck in the approval pipeline. What looks like "many pendings" is actually the **"To Withdraw"** column on each partner card showing outstanding balances that come from two sources:

1. **Rejected / expired / cancelled requests** — 42 requests totalling ~67M UGX where the partner asked, FinOps declined or it timed out, and the ROI returned to the partner's available balance. Heaviest hitters:
   - Grace Paul Ochieng: 5 rejected (40.1M) + 5 expired (6.5M)
   - ATUHAIRE CAROLYNE: 6 rejected (11M) + 1 cancelled (7.5M)
   - LOLEM FIRICILA: 16 rejected (381k) + 2 expired (100k)
   - Lukodda Joseph, MUKISA PEACE, BANKO DAVID — smaller amounts
2. **Newly accrued ROI** that never had a withdrawal request raised against it.

Both are correctly *withdrawable*, not pending — but the UI offers no way for Carol to tell the difference, which is why every card looks like an unresolved pending item.

## Plan — make the Proxy Partner Funds card honest

### 1. Replace the misleading "Pending" badge with explicit context

`src/components/agent/ProxyPartnerFunds.tsx` currently shows a `Pending` badge only when an active withdrawal_requests row exists. Add three new derived signals per partner card so Carol can see *why* a balance is sitting there:

- `Awaiting request` (neutral) — partner has `available > 0` and **no** active/historical request in the last 7 days. These are fresh ROI accruals.
- `Last attempt rejected` (destructive) — most recent withdrawal_requests row is `rejected`. Show the rejection reason inline (already in DB).
- `Last attempt expired` (warning) — most recent row is `expired`. Show the expiry date.

These replace the silent `null` that today makes Carol assume the balance is "pending."

### 2. Fetch the last terminal request per partner

Extend the existing `Promise.all` block (around line 211) to also load the **most recent** `rejected | expired | cancelled` withdrawal_requests row per `linked_party` from Carol's partners. Store it in a new `lastTerminalByPartner` map keyed the same way as `partnerWithdrawalStatus`.

### 3. New "Why is this here?" expandable row

Below the 3-stat grid (Returns Due / Delivered / To Withdraw), add a small collapsible line:

- If `lastTerminalByPartner[key]` exists → "Last withdrawal {rejected|expired} on {date}. Reason: {rejection_reason || 'auto-expired after timeout'}. Funds returned to wallet — re-request below."
- Else if `available > 0` and no record at all → "ROI accrued and ready. No withdrawal has been requested yet."

### 4. Filter / sort controls at the top of the list

Add a small toolbar above the card list with three pills:
- **All** (default)
- **Re-request needed** (rejected/expired)
- **New ROI** (no prior request)

Counts shown in the pill labels so Carol immediately sees "Re-request needed (8) · New ROI (12)" rather than scrolling.

### 5. Optional follow-up — surface in the dashboard tile

The "Proxy Partner Funds" entry on `/dashboard/agent` currently shows just a total. Add a sub-line: "X partners need re-request · Y new ROI ready" so the urgency is visible before drilling in.

## Technical notes

- No schema changes. All data already exists in `withdrawal_requests` (status, rejection_reason, updated_at).
- Real-time channel already subscribed on line 95 — no changes needed there.
- Keep the existing `getStatusBadge` for active in-flight requests; we are only adding badges for the *absence* of an active request.
- Status priority for the badge: active > rejected/expired > new ROI.

## What this does NOT change

- No money is moved or re-credited; nothing in the ledger is touched.
- The 34 rejected and 7 expired requests stay as historical records.
- Carol can immediately raise fresh withdrawal requests for any partner — the balances were always available, the UI just didn't say so.