# Angel Pool Share Purchase Confirmation Email

Trigger an emailed receipt to the investor (the partner the agent is registering for shares) **after** the agent clicks **Confirm** in `AgentAngelPoolInvestDialog` — i.e. only after `agent-angel-pool-invest` completes successfully.

## Step 1 — Add a new transactional email template

Create `supabase/functions/_shared/transactional-email-templates/angel-pool-share-purchase.tsx`, faithfully porting the uploaded HTML to React Email components (matching the existing pattern of `partner-wallet-deposit.tsx`).

Props the template accepts:

| Prop | Source |
|---|---|
| `partner_name` | investor `profiles.full_name` |
| `pool_name` | `"Welile Angel Pool"` (constant) |
| `share_reference` | `reference_id` from RPC result (e.g. `ANG260505XXXX`) |
| `shares_purchased` | `shares` |
| `currency` | `"UGX"` |
| `investment_amount` | `actual_amount` (formatted with thousand separators) |
| `ownership_percentage` | `company_ownership_percent` formatted to 4 decimals — this is true company equity, matches the regulator-facing definition |
| `price_per_share` | `20,000` (constant `PRICE_PER_SHARE`) |
| `pool_valuation` | `TOTAL_SHARES × PRICE_PER_SHARE` = `500,000,000` (the 8% pool's UGX valuation) |
| `purchase_date` | server `now()` formatted as `DD Mon YYYY, HH:MM` |
| `total_pool_shares` | `25,000` (constant `TOTAL_SHARES`) |
| `available_shares` | `TOTAL_SHARES − totalSharesSold` **after** this purchase, computed from a fresh post-insert read of `angel_pool_investments` (status='confirmed') so the figure is always live and never stale |
| `pool_percentage` | `8` (constant `POOL_PERCENT`) |
| `pool_round` | `"Seed Round"` (no rounds table exists today; constant for now, easy to swap to a DB lookup later) |
| `company_name` | `"Welile"` |

Register the template under key `angel-pool-share-purchase` in `supabase/functions/_shared/transactional-email-templates/registry.ts`. Subject line: `"Angel Pool share purchase confirmed — {{shares}} shares ({{reference}})"`.

## Step 2 — Send the email from the edge function (server-side, post-confirm)

Edit `supabase/functions/agent-angel-pool-invest/index.ts`. After the investment + commission ledger entries succeed and *after* the `angel_pool_investments` row is inserted (so `available_shares` is accurate), do the following — all inside a `try { … } catch` that **never fails the request** (email is best-effort, the financial transaction is the source of truth):

1. Read the investor's `profiles.email` and `profiles.full_name` via the admin client.
2. If `email` is non-empty, recompute `available_shares` from the fresh `angel_pool_investments` aggregate (post-insert).
3. `await adminClient.functions.invoke('send-transactional-email', { body: { templateName: 'angel-pool-share-purchase', recipientEmail: email, idempotencyKey: \`angel-pool-${referenceId}\`, templateData: { …all the props above… } } })`.
4. Log a `system_event` `agent_angel_pool_email_sent` (or `…_skipped` if no email on file).

Idempotency: the `idempotencyKey` derives from `reference_id`, so even if the agent retries the dialog the email won't be sent twice.

## Step 3 — UI: no changes required

The dialog already calls `agent-angel-pool-invest` only on **Confirm**, then advances to the success step. Email dispatch happens server-side as part of that same call, so the contract — *“only after Confirm”* — is automatically honored. No client-side email trigger is added (which would be insecure and bypassable).

## Data accuracy guarantees

- All UGX figures are formatted server-side with `toLocaleString('en-US')` to give the comma grouping shown in the mockup (e.g. `200,000`).
- `ownership_percentage` uses `.toFixed(4)` to match the dialog's `0.0032%` precision.
- `available_shares` is **always** read post-insert so the user sees the true remaining inventory at the moment they bought, not a stale figure.
- `purchase_date` is the server transaction timestamp (`txDate`) — same value persisted to the ledger — so the email and the ledger never disagree.
- Reference ID in the email is the exact `referenceId` written to `angel_pool_investments` and to both ledger legs.

## Out of scope

- No SMS fallback for investors with no email on file (logged-only). Can be added later via the existing Africa's Talking integration if you want.
- `pool_round` is currently a constant; if/when a `pool_rounds` table is introduced this becomes a one-line lookup.
