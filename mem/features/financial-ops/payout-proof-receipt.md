---
name: Payout proof-of-payment receipt
description: Public tokenized receipt page (/r/:token) + QR + PDF download; SMS/push links generated when a merchant agent confirms a withdrawal payout
type: feature
---
When a merchant agent confirms a payout (`approve-withdrawal` edge fn, any settle path), the customer, merchant, in-app notification, and push all link to a verifiable proof-of-payment receipt.

**Secure token URL (primary):** `https://welilereceipts.com/r/<receipt_token>`. `withdrawal_requests.receipt_token` = unguessable 32-char hex (128-bit), column DEFAULT `substr(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),1,32)`, unique index, backfilled for existing rows. Prevents receipt enumeration. Legacy id URL `/receipt/:id` still works (in-app/authenticated).

**Public page:** `src/pages/PayoutReceipt.tsx`, routes `/r/:token` and `/receipt/:id` (App.tsx, public/no-auth). Loads via SECURITY DEFINER RPCs `get_payout_receipt_by_token(p_token text)` (resolves token→id then calls the by-id builder) and `get_payout_receipt(p_withdrawal_id uuid)`; both granted anon/authenticated/service_role. Returns NULL if not found, `{paid:false,status}` if unsettled, else full jsonb. Only for `status in ('completed','fin_ops_approved')` with non-null `processed_at`.

**Receipt fields:** receipt_number (`WD`+YYMMDD+`-`+6 hex of id), transaction_type ('Cash Withdrawal'), amount, commission (0.5% ledger leg `<id>-cashout-commission`), recipient_name (customer), processor_name/phone (merchant agent), merchant_branch (`cashout_agents.label` of processed_by), reference (=`fin_ops_reference` TID), processed_at, receipt_token. Method-gated destination: bank → bank_name/account_number/account_name; MoMo/cash → mobile_money_number/name/provider.

**Page features:** COMPLETED status badge, on-screen QR (`qrcode.react` QRCodeCanvas) resolving to the public token URL, and a **Download PDF** button that builds the receipt with `jspdf` + `qrcode` toDataURL (programmatic layout — avoids html2canvas oklch issues). PDF filename `welile-receipt-<receipt_number>.pdf`.

**Messaging (approve-withdrawal):** customer SMS = "Withdrawal Successful … Transaction ID … digital receipt <url>"; merchant SMS = "Payout Completed … paid UGX X to {customer} … Commission Earned … TID … Receipt <url>"; customer push = "Withdrawal Completed / tap to view receipt" (url `/r/{token}`); notification metadata carries `receipt_url` + `receipt_token`. `receiptToken` fetched once and shared across all channels.

The TID the agent enters at confirm time IS the proof; the receipt is auto-generated from it — no separate image upload.
