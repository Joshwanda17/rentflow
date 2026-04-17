

## Plan — Extract a "Tenant Repayment Receipt" from the Rent Statement

### What exists today
- `src/lib/receiptPdf.ts` has **two** PDFs: `DEPOSIT RECEIPT` and `RENT STATEMENT` (whole-plan view tied to a rent request: rent amount, total repayment, amount repaid, outstanding, progress bar).
- The `repayments` table holds individual payment events: `id, tenant_id, rent_request_id, amount, created_at` — but has **no receipt/document** of its own.
- After a successful float allocation (`agent_allocate_tenant_payment` RPC), the agent dialog (`AgentTenantCollectDialog`) shows numbers but offers no downloadable proof.
- Tenants/landlords get no per-payment document — only the cumulative rent statement.

### What I'll build

**1. New PDF generator: `RENT REPAYMENT RECEIPT`** (in `src/lib/receiptPdf.ts`)
A focused, single-payment document with:
- Header: "RENT REPAYMENT RECEIPT" + receipt number `WEL-RPT-<short-id>`
- Big payment amount (purple)
- Status badge: PAID / PARTIAL
- Parties block: Tenant (name, phone), Landlord (name, property)
- Payment block: amount paid, payment method (cash/wallet/float allocation), tracking ID (e.g. `ALLOC-XXXX`), collected by (agent name if applicable), date/time
- Plan summary block (mini, derived from rent request): total repayment, repaid-to-date (after this payment), outstanding-after, % complete
- Footer: "Thank you for your payment" + system-generated note

Exports:
- `generateRentRepaymentReceiptPdf(data)`
- `downloadRentRepaymentReceipt(data)`
- `buildRentRepaymentReceiptWhatsApp(data)`

Type `RentRepaymentReceiptData`:
```ts
{
  receiptId: string;            // repayments.id
  trackingId?: string;          // ALLOC-XXXX from agent_collections
  paymentAmount: number;
  paymentMethod: 'cash' | 'wallet' | 'float_allocation' | 'mobile_money';
  collectedByName?: string;     // agent full name
  paidAt: string;
  tenantName: string; tenantPhone?: string;
  landlordName: string; propertyAddress?: string;
  rentRequestRef: string;       // WEL-XXXXXXXX
  totalRepayment: number;
  amountRepaidAfter: number;
  outstandingAfter: number;
}
```

**2. Wire into the float allocation success view** (`src/components/agent/AgentTenantCollectDialog.tsx`)
- After `result.success`, add a "📄 Download Receipt" + "📤 Share via WhatsApp" button row inside the existing success card.
- Build receipt data from the RPC return (`tracking_id`, `amount`, `outstanding_after`, `commission_balance`) + the tenant/request props already in the dialog.

**3. Wire into the agent tenants sheet history** (`src/components/agent/AgentTenantsSheet.tsx`)
- Where `downloadRentStatement` button currently sits, add a sibling **"Per-payment receipts"** expandable list — each repayment row gets its own download/share button.

**4. Tenant-side access** (`src/components/tenant/TenantRepaymentHistory.tsx` or similar)
- I'll locate the existing tenant repayment list and add per-row download icons. (Will inspect during implementation.)

### Files to change
- `src/lib/receiptPdf.ts` — add `RENT REPAYMENT RECEIPT` generator + WhatsApp builder + download helper
- `src/components/agent/AgentTenantCollectDialog.tsx` — add download/share buttons in success view
- `src/components/agent/AgentTenantsSheet.tsx` — per-repayment receipt buttons
- One tenant-side repayment history component (TBD during implementation) — per-row receipt buttons

### Out of scope (ask if you want these too)
- Storing the generated PDF in Supabase Storage (currently all receipts are generated on-demand client-side; matches existing pattern)
- Auto-emailing/SMSing the receipt
- Removing the existing whole-plan `RENT STATEMENT` (it stays — they serve different purposes)

### One quick confirm
If by "extract the rent payment document" you actually meant something different (e.g. moving an *uploaded* proof file from the rent_request to repayments, or a DB column migration), reply now and I'll re-plan. Otherwise reply "go" and I'll build the per-repayment receipt.

