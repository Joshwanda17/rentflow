## Behavior change

Right now an in-flight (pending/processing) proxy withdrawal does **not** reduce the partner's "To Withdraw" amount, so the card sticks around with a `Withdrawal In Progress` button. Caro wants the card to **disappear the instant she initiates the withdrawal** — treating the ROI as already delivered to the partner.

If the withdrawal is later **rejected or cancelled**, the active record is gone, the balance is back to "available", and the card naturally reappears (already wired up via the realtime subscription + `loadProxyFunds` reload).

## Implementation

Single small change in `src/components/agent/ProxyPartnerFunds.tsx`:

1. Keep the existing fetch of active withdrawals (`activeWithdrawalRes`) — it already pulls `id, linked_party, status` for `pending / requested / manager_approved / cfo_approved / processing`.
2. **Also store the active withdrawal amounts** by adding `amount` to the select.
3. New state `activeWithdrawalsByPartner: Record<string, number>` holding the sum of in-flight withdrawals per partner.
4. In the `partnerBalances` memo, subtract **both** completed AND active withdrawal totals when computing `partnerAvailable`:
   ```ts
   const totalDeducted = (withdrawalsByPartner[partnerId] || 0)
                       + (activeByPartner[partnerId] || 0);
   partnerAvailable[partnerId] = Math.max(0, partnerTotals[partnerId] - totalDeducted);
   ```
5. Combined with the existing `available > 50` guard, the card silently drops off the list.
6. Show a small **"In flight"** count chip next to the toolbar so Caro can see how many cards just disappeared and can still review them via a one-click filter.

## Visibility for the agent (no surprise)

Add a tiny new filter pill in the toolbar:

```text
[ All (N) ] [ In flight (M) ] [ Re-request (X) ] [ New ROI (Y) ]
```

`In flight` shows the cards she just sent for withdrawal — same card layout but `available = 0`. She can still hit **Cancel** there if she made a mistake. They are **excluded from the default `All` view** (which is why they "disappear" per her ask).

To make `In flight` work correctly: when computing `partnerBalances`, do not filter out cards whose available drops to 0 **only because of an in-flight withdrawal**. Instead tag them and filter at the `visibleBalances` step — so the `All` view hides them but the `In flight` view shows them.

## Files

- **Edited**: `src/components/agent/ProxyPartnerFunds.tsx` only.

No DB, edge function, ledger, or wallet changes. No effect on COO/Partner Ops dashboards.
