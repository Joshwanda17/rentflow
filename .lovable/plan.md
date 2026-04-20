
User confirmed: don't lock at all. So receipt is "strongly nudged" not "hard blocking". Adjust Phase 5 accordingly — banner-only, no hard lock, no 24h escalation to lock. Maybe escalate notifications instead.

## Final Plan — Landlord Float Payout (locked spec)

Five phases. Each ships independently and is testable before the next.

### Locked decisions
- Allocation auto-created when CFO disburses a rent request.
- Receipt upload is a **persistent nudge, never a hard lock**.
- After 24h pending, escalate via SMS/notification to the agent, but dashboard stays usable.
- Receipt images stored in private Supabase Storage bucket; signed URLs for FinOps/COO/manager review.

### Phase 1 — Per-tenant allocations
- New table `agent_landlord_float_allocations` (agent, tenant, rent_request, landlord name+phone, allocated/paid/remaining, status: open|partially_paid|fully_paid).
- DB trigger on CFO rent disbursement → insert allocation row + credit `agent_landlord_float.balance`.
- Backfill existing float into a single "Unallocated" bucket so current balances aren't orphaned.
- UI: tap `AgentLandlordFloatCard` → tenant list with open allocations → tap tenant → details + "Withdraw for landlord" button.

### Phase 2 — OTP stays, disbursement becomes manual
- Refactor `landlord-payout-disburse`: deduct float, create payout row at status `pending_finops_disbursement`. No MoMo gateway call.
- Returns: "Sent to Financial Ops for disbursement."

### Phase 3 — Financial Ops queue
- New tab "Landlord Payouts" in `FinancialOpsCommandCenter`.
- Big card: landlord name + MoMo provider/number (copy button), amount, agent, tenant, allocation source.
- Actions:
  - **Mark Disbursed** → capture MoMo confirmation code → status `awaiting_agent_receipt`, SMS landlord, push notify agent.
  - **Reject/Refund** → reason → calls `refund_agent_float_for_payout`.
- New columns on `landlord_payouts`: `finops_disbursed_by, finops_disbursed_at, finops_momo_reference`.

### Phase 4 — Receipt upload
- New columns: `receipt_number, receipt_image_url, receipt_uploaded_at`.
- Private storage bucket `landlord-payout-receipts` (RLS: agent writes own; FinOps/COO/manager read all).
- New edge function `submit-landlord-payout-receipt`: validates receipt# (≥4 chars) + image present → status `completed` → updates allocation `paid_out_amount` + recomputes status.
- Agent UI: modal with receipt# input + camera/upload, opened from banner or tenant detail screen.

### Phase 5 — Persistent nudge (no lock)
- Hook `useLandlordPayoutReceiptGate()` queries pending receipts for agent.
- Always-visible banner at top of agent dashboard listing each pending receipt (landlord, amount, time since disbursement) with "Upload now" button. Dismissible per-session but reappears next visit until filed.
- After 24h pending → fire SMS reminder to agent (one per payout), tag in events as `landlord_receipt_overdue`, surface in COO/FinOps oversight view. Dashboard stays fully usable.

### State machine
```text
pending_otp → otp_verified → pending_finops_disbursement
  → awaiting_agent_receipt → completed
  ↘ failed (refund)         ↙
```

### Order of execution
Phase 1 → demo → Phase 2 → demo → Phase 3 → demo → Phase 4 → demo → Phase 5 → demo.

Approve to start Phase 1.
