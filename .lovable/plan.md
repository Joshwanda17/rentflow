

## Send "Partner Wallet Deposit" email when CFO approves an ROI Payout

When the CFO clicks **Approve** on an ROI Payout (Send Money tab), the new `partner-wallet-deposit` template will be sent to the partner with the exact transaction details from the approved row.

### What changes

One file: **`supabase/functions/approve-wallet-operation/index.ts`** — the existing ROI-payout email block (lines 693–767) currently sends `returns-disbursement-confirmation`. Swap it to send the new `partner-wallet-deposit` template, and pass the exact data the user requires.

### Field mapping (locked, no defaults guessed)

| Email field | Source |
|---|---|
| `partner_name` | `profiles.full_name` for `op.user_id` |
| `transaction_id` (Reference ID) | `op.reference_id` — the same ROI payout reference shown on the queue card. Fallback chain: `op.reference_id → payment_reference → op.id`. **No prefix added.** |
| `amount` | `op.amount` |
| `currency` | `'UGX'` |
| `date` (Processing Date) | `new Date()` formatted `dd Month yyyy` (e.g. `21 April 2026`) — same format the queue card uses |
| `wallet_id_last4` | Last 4 chars of `wallets.id` for the partner (`op.user_id`). Looked up via `select id from wallets where user_id = op.user_id`. For managed/proxy payouts the partner is still `op.user_id` (the partner owns the credited liability — the proxy agent is just the cash collector), so the partner's own wallet ID is correct. |
| `source` | `'Platform'` (per your prior directive) |
| `company_name` / `logo_url` / links | Same defaults already used by the existing email block |

The template's `funded_by_agent` / `agent_name` props were removed in the previous step — they will not be passed.

### Idempotency

Keep the existing `idempotencyKey: \`roi-payout-${op.id}\`` so a re-approval cannot double-send. Update the key prefix to `partner-wallet-deposit-${op.id}` so it is distinct from any prior `roi-payout-${op.id}` send-log entry and the email is allowed to go out once after this change ships.

### Trigger condition (unchanged from current block)

```ts
if (op.category === 'roi_payout' || op.category === 'supporter_platform_rewards') { ... }
```

This already fires from the **Send Money → ROI Payout — Expense** Approve button (which calls `approve-wallet-operation` via `ROIPayoutQueue.tsx`) and from the standalone `CFOROIRequests` tab — both surfaces will now send the new template.

### Pseudocode of the swap

```ts
// fetch partner profile (existing)
const { data: partnerProfile } = await adminClient
  .from("profiles").select("email, full_name").eq("id", op.user_id).maybeSingle();

// NEW: fetch partner wallet id for last-4
const { data: partnerWallet } = await adminClient
  .from("wallets").select("id").eq("user_id", op.user_id).maybeSingle();
const walletLast4 = partnerWallet?.id ? partnerWallet.id.replace(/-/g, '').slice(-4) : '';

const refId = op.reference_id || payment_reference || op.id;
const todayLabel = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });

await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
  method: "POST",
  headers: { "Content-Type":"application/json", "Authorization":`Bearer ${supabaseServiceKey}` },
  body: JSON.stringify({
    templateName: "partner-wallet-deposit",
    recipientEmail: partnerProfile.email,
    idempotencyKey: `partner-wallet-deposit-${op.id}`,
    templateData: {
      partner_name: partnerProfile.full_name || "Partner",
      transaction_id: refId,           // ← exact ROI payout reference ID
      amount: op.amount,
      currency: "UGX",
      date: todayLabel,
      wallet_id_last4: walletLast4,    // ← partner's actual wallet UUID, last 4 chars
      source: "Platform",
    },
  }),
});
```

### Out of scope

- The template itself (`partner-wallet-deposit.tsx`) and its registry entry — already shipped in the previous step.
- The `returns-disbursement-confirmation` template stays in the registry but is **no longer sent** for ROI payouts (replaced by `partner-wallet-deposit`). It can be repurposed later for a different event without further changes here.
- No edge function deploys for any other function, no schema or RLS changes.

### Files touched

- `supabase/functions/approve-wallet-operation/index.ts` (one block replaced, ~lines 693–767)

