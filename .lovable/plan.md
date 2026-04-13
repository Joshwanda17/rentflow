

## Plan: Agent Wallet History PDF Download

### Summary
Add a "Download Wallet Report (PDF)" button in two places:
1. **Agent Ops Dashboard** — inside the Agent Directory, after searching/selecting an agent, a button to download that specific agent's full wallet ledger as a PDF
2. **Agent's own Wallet** — inside the `FullScreenWalletSheet`, a download button for their own wallet history

The PDF will be a professional financial report showing wallet summary, rent payment breakdown, and full transaction log from the `general_ledger`.

### Changes

**1. New PDF generator: `src/lib/agentWalletReportPdf.ts`**
- Create a new PDF generator (separate from the existing `agentReportPdf.ts` which is for collection reports)
- Accepts: agent name, phone, wallet balance, commission balance, float balance, and ledger entries
- PDF sections:
  - Header with agent name, ID, report date
  - Wallet Summary: Total Balance, Float Balance, Commission Balance, Total Deposits, Total Spent on Rent
  - Rent Payment Breakdown table: Date, Tenant/Description, Amount, Reference
  - Full Transaction Log table: Date, Category, Type (In/Out), Amount, Description
- Uses jsPDF (already in project) with the same Welile branding style as existing reports

**2. Agent Ops — Add download button to Agent Directory (`src/components/executive/AgentDirectory.tsx`)**
- When an agent is selected/expanded, add a "Download Wallet Report" button
- On click: fetch that agent's `general_ledger` entries (scoped to `wallet`), their wallet balance, and generate the PDF
- Uses the new PDF generator

**3. Agent Wallet — Add download button to `src/components/wallet/FullScreenWalletSheet.tsx`**
- Add a small "Download Statement" button near the wallet statement section
- On click: fetch the logged-in agent's own ledger entries and generate the same PDF
- Only visible when `role === 'agent'`

**4. Shared data fetcher: `src/lib/fetchAgentWalletData.ts`**
- Helper function to fetch all ledger entries for a given user ID from `general_ledger` where `ledger_scope = 'wallet'`
- Fetches wallet balance from `wallets` table
- Fetches agent split balances (commission vs float) by computing from ledger categories
- Returns structured data ready for PDF generation
- Reusable by both Agent Ops and the agent's own wallet

### Technical Details

```text
Data flow:
  Agent Ops:   AgentDirectory → select agent → click Download
                → fetchAgentWalletData(agentId) → generateAgentWalletReportPdf(data) → browser download

  Agent Side:  FullScreenWalletSheet → click Download Statement
                → fetchAgentWalletData(user.id) → generateAgentWalletReportPdf(data) → browser download

PDF structure:
  ┌─────────────────────────────────────┐
  │  WELILE — Agent Wallet Statement    │  (purple header)
  │  Agent: Name  |  Date: ...          │
  ├─────────────────────────────────────┤
  │  💰 Wallet Summary                  │
  │  Total Balance | Float | Commission │
  │  Total Deposits | Total Rent Paid   │
  ├─────────────────────────────────────┤
  │  🏠 Rent Payments Breakdown         │
  │  Date | Description | Amount | Ref  │
  │  ...rows...                         │
  ├─────────────────────────────────────┤
  │  📋 Full Transaction History        │
  │  Date | Category | In/Out | Amount  │
  │  ...rows...                         │
  └─────────────────────────────────────┘
```

### Files to create/edit
- **Create**: `src/lib/agentWalletReportPdf.ts` — PDF generator
- **Create**: `src/lib/fetchAgentWalletData.ts` — shared data fetcher
- **Edit**: `src/components/executive/AgentDirectory.tsx` — add download button per agent
- **Edit**: `src/components/wallet/FullScreenWalletSheet.tsx` — add download button for agent's own statement

### No database changes needed
All data already exists in `general_ledger` and `wallets` tables with appropriate RLS policies.

