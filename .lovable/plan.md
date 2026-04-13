

## Plan: Show Tenant Names in Wallet Report PDF

### Problem
The rent payment breakdown in the PDF shows generic descriptions like "Agent paid UGX 20,000 for tenant" without specifying **which** tenant was paid for.

### Root Cause
1. The `general_ledger` stores the tenant's user ID in the `linked_party` column, but the data fetcher doesn't include it
2. The edge function (`agent-deposit`) writes a generic description without the tenant's name
3. The PDF generator just displays the description as-is

### Changes

**1. Fix the edge function description (`supabase/functions/agent-deposit/index.ts`)**
- Before creating the ledger entry, fetch the tenant's `full_name` from `profiles`
- Change description from `"Agent paid UGX X for tenant"` to `"Agent paid UGX X for tenant: <Tenant Name>"`
- This fixes all **future** transactions

**2. Update the data fetcher (`src/lib/fetchAgentWalletData.ts`)**
- Include `linked_party` in the ledger query select
- After fetching entries, collect all unique `linked_party` UUIDs from rent entries
- Batch-fetch tenant names from `profiles` table
- Enrich each rent entry with the resolved tenant name (stored in a new `tenant_name` field on the interface)
- This fixes **existing** transactions that already have `linked_party` set

**3. Update the PDF generator (`src/lib/agentWalletReportPdf.ts`)**
- In the Rent Payment Breakdown table, display the tenant name instead of the raw description
- Format as: "Paid for: Tenant Name" or fall back to the description if no tenant name is available

### Files to edit
- `supabase/functions/agent-deposit/index.ts` — include tenant name in ledger description
- `src/lib/fetchAgentWalletData.ts` — add `linked_party` to query, resolve tenant names
- `src/lib/agentWalletReportPdf.ts` — display tenant name in rent breakdown table

