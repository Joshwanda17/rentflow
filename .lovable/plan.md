# Why the 200,000 deposit isn't showing

The deposit **does** exist — it just lives in a queue that the UI doesn't currently expose.

Verified in the database:

| Receipt | Amount | Provider | Status | Submitted |
|---|---|---|---|---|
| RCT1505 | 200,000 | `agent_cash` | pending | 27 Apr 11:22 |
| RCT1506 | 260,000 | `agent_cash` | pending | 27 Apr 12:00 |
| RCT1207 | 260,000 | `agent_cash` | pending | 27 Apr 12:37 |
| RCT1205 | 200,000 | `agent_cash` | pending | 27 Apr 12:37 |

The "Verify a user deposit" panel filters strictly by `provider` (the dropdown — MTN / Airtel / Bank). All four of SSENKAAL PIUS's deposits were submitted via the **Agent Cash** channel, so the MTN queue (and Airtel/Bank queues) will always show "0 pending" for them. There's currently no Agent Cash option in the provider switcher, so the rows are effectively orphaned in the UI.

# The fix

Extend the Financial Ops verify panel to include an **Agent Cash** queue alongside MTN / Airtel / Bank.

## Changes

1. **`src/components/financial-ops/TidVerification.tsx`**
   - Add `agent_cash` as a selectable provider in the provider dropdown (label: "Agent Cash").
   - Update the queue header label so it reads "PENDING AGENT CASH DEPOSITS" when that provider is active.
   - Relax the TID format pre-check (line ~756) so the `MP` prefix requirement only applies when provider is `mtn` — agent_cash receipts use the `RCT####` / `WEL-####` format already shown in the placeholder.
   - Keep all existing behavior (realtime subscription, picker, mismatch logging) — they're already provider-parameterized and will work for `agent_cash` automatically.

2. **No database migration needed.** The rows already exist with the correct provider tag; we're just surfacing them.

## Result

After the change, opening the verify panel and selecting **Agent Cash** will show all 4 pending rows for SSENKAAL PIUS (200K + 260K + 260K + 200K = 920K). Carolyne / Financial Ops can then approve them normally through the existing flow.
