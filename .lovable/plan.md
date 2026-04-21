

## New transactional email: Partner Wallet Deposit

Add a new React Email template that fires when a partner's wallet receives a deposit, matching the HTML mock you uploaded and styled identically to the existing `returns-disbursement-confirmation` template (same purple brand, same card layout, same footer).

### What gets created

**1. `supabase/functions/_shared/transactional-email-templates/partner-wallet-deposit.tsx`** — new React Email template.

Component name: `PartnerWalletDeposit`. Structure mirrors `returns-disbursement-confirmation.tsx` so the brand stays consistent across all partner emails:

- Top purple gradient bar
- Header with Welile logo (left) + "Secure Notification" tag (right)
- Hero: circular checkmark icon badge → headline **"Wallet Deposit Successful"** → "Dear {partner_name},"
- Intro line: *"Great news! The funds have successfully credited to your wallet and are now available for use."*
- Ledger card with:
  - **Amount Received** (large purple amount, formatted via shared `formatAmount` pattern)
  - **Reference ID** (monospace)
  - **Processing Date**
  - **Destination** → `WALLET` with `••••{wallet_id_4_digits}` subtext
  - Optional **Funded By** row when `funded_by_agent = true` and `agent_name` is provided (matches the proxy-agent pattern already used in returns disbursement)
- Outro: *"You can now log in to your account to view your updated wallet balance and transaction history."* + Contact Support link
- Standard Welile footer (social icons, address, privacy/terms/unsubscribe, copyright)

Props interface:

```ts
interface PartnerWalletDepositProps {
  partner_name?: string
  transaction_id?: string
  amount?: string | number
  currency?: string                 // defaults to 'UGX'
  date?: string
  wallet_id_last4?: string          // shown as ••••1234
  source?: string                   // e.g. 'CFO Direct Credit', 'Mobile Money', 'Agent Cash'
  funded_by_agent?: boolean
  agent_name?: string
  company_name?: string
  logo_url?: string
  unsubscribe_url?: string
  contact_url?: string
}
```

Exports a `template: TemplateEntry` with:
- `component: PartnerWalletDeposit`
- `subject: (data) => 'Wallet deposit of ${formatted} received'`
- `displayName: 'Partner Wallet Deposit'`
- `previewData` populated with realistic UGX values so it renders in the preview tool

**2. `supabase/functions/_shared/transactional-email-templates/registry.ts`** — register the new template:

```ts
import { template as partnerWalletDepositTemplate } from './partner-wallet-deposit.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'test-email': testTemplate,
  'returns-disbursement-confirmation': returnsDisbursementTemplate,
  'partner-wallet-deposit': partnerWalletDepositTemplate,
}
```

That's all that's needed for the template to appear in the preview endpoint and be sendable via the existing transactional email infrastructure.

### Out of scope (will not be touched in this step)

- No edge function is wired to *send* this template yet — that's a separate trigger task. This step only ships the template + registry entry so it's available, previewable, and ready to be invoked.
- No DB or schema changes.
- The existing `returns-disbursement-confirmation` template is left untouched.

### Files touched

- `supabase/functions/_shared/transactional-email-templates/partner-wallet-deposit.tsx` (new)
- `supabase/functions/_shared/transactional-email-templates/registry.ts` (one import + one registry line)

