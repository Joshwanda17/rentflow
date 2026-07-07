---
name: Payout proof-of-payment receipt
description: Public receipt page + SMS link generated when a merchant agent confirms a withdrawal payout; shows amount, method-specific destination, TID, date/time, processor
type: feature
---
When a merchant agent confirms a payout (`approve-withdrawal` edge fn, any settle path), the recipient SMS now links to a verifiable proof-of-payment receipt: `https://welilereceipts.com/receipt/<withdrawal_id>` (replaced the generic `/ZQhyGb` short link).

**Public page:** `src/pages/PayoutReceipt.tsx`, route `/receipt/:id` (registered in `App.tsx`, public/no-auth). Reads via SECURITY DEFINER RPC `get_payout_receipt(p_withdrawal_id uuid)` (granted to anon/authenticated/service_role). RPC returns NULL if not found, `{paid:false,status}` if not yet settled, else full receipt jsonb. Only returns receipts for `status in ('completed','fin_ops_approved')` with non-null `processed_at`.

**Receipt fields:** recipient_name, amount, payout_method, reference (=`fin_ops_reference` TID), processed_at (date+time), processor_name + processor_phone (from `profiles` of `withdrawal_requests.processed_by`). Method-gated: bank → bank_name/bank_account_number/bank_account_name; MoMo/cash → mobile_money_number/mobile_money_name/mobile_money_provider.

The TID the agent enters at confirm time IS the proof; the receipt is auto-generated from it — no separate image upload. Confirm UI (`WithdrawalPayoutCard`) tells the agent a receipt link is sent to the recipient.
