

## Plan: Add Tenant Wallet Balance to Agent Wallet Report PDF

### What changes
After each rent payment row in the PDF's "Rent Payment Breakdown" table, show the tenant's current wallet balance so the agent can see exactly how much each tenant owes or has remaining.

### Changes

**1. Update data fetcher (`src/lib/fetchAgentWalletData.ts`)**
- After resolving tenant names, also batch-fetch tenant wallet balances from the `wallets` table using the same `tenantIds` list
- Add `tenant_balance` field to `AgentLedgerEntry` interface
- Enrich each rent entry with the tenant's current wallet balance

**2. Update PDF generator (`src/lib/agentWalletReportPdf.ts`)**
- Add a "Tenant Balance" column to the Rent Payment Breakdown table header
- Display each tenant's wallet balance next to their rent payment row
- Format the balance in UGX, consistent with other amounts

### Files to edit
- `src/lib/fetchAgentWalletData.ts` — fetch tenant balances, add to entries
- `src/lib/agentWalletReportPdf.ts` — add tenant balance column to rent breakdown table

