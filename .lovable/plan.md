

# Plan: Exhaustive Update of WELILE_WORKFLOW.md (Both Files)

## Problem

Both `WELILE_WORKFLOW.md` (root) and `public/WELILE_WORKFLOW.md` have several sections that are **outdated or inconsistent** with the current codebase. The user wants every section updated with full UI and backend detail — not summaries.

## Key Discrepancies Found

### 1. Agent Commission Model (CRITICAL — Both files wrong)

**Root file** (Section 4.13): Says "5% commission" and "Sub-agent signup: UGX 500". The latest migration (`20260402132328`) confirms:
- **10% total commission** on rent repayments (not 5%)
- Source Agent: 2%, Manager Agent: 8% (or 6% if recruiter exists + 2% recruiter override)
- Flat bonuses: UGX 5,000 (listings, verifications, rent applications), UGX 10,000 (sub-agent registration), UGX 20,000 (tenant replacement)
- Platform-side outflows categorized as `marketing_expense` (not generic `agent_commission`)

**Public file** (Section 23): Says "5% on rent repayments", "Sub-Agent Split: Sub-agent 4%, Super Agent 1%". Also wrong.

**Section 45 (Cash Flow Summary)** in public file: References "5% commission" and "UGX 500/tenant registration". Both wrong.

### 2. Double-Entry Commission Ledger (Missing from public file)

The commission functions now create **paired entries**:
- Platform: `cash_out`, category `marketing_expense`, scope `platform`
- Agent: `cash_in`, category `agent_commission`, scope `wallet`

Both linked via shared `transaction_group_id`. This is documented in root file's Section 34 but **not reflected** in:
- Root Section 4.13 (Agent Earnings Model)
- Root Section 17.4 (Repayment Accounting — still says "5% commission")
- Public Section 23 (Agent Earnings)
- Public Section 31 (Double-Entry Ledger — doesn't mention `marketing_expense`)
- Public Section 45 (Cash Flow Summary)

### 3. `credit_agent_event_bonus` Function (Missing from both files)

A new RPC that handles flat-fee bonuses with the same double-entry marketing expense pattern. Not documented in the Edge Functions registry or the RPCs section.

### 4. Missing Edge Functions (Both files)

Functions present in `supabase/functions/` but missing from documentation:
- `angel-pool-invest` — Angel Pool share investment (25K shares × UGX 20K, 8% pool allocation)
- `tenant-pay-rent` — Direct tenant rent payment
- `wallet-deduction` — Financial Ops wallet deduction tool
- `notify-managers` — Manager notification system (fire-and-forget)
- `provision-staff-passwords` — Staff password provisioning
- `bulk-password-reset` — Mass password reset
- `diagnose-auth` — Auth diagnostics

Root file is missing several of these; public file lists some but not all.

### 5. Agent Commission Benefits Page (Missing from both files)

New UI page `AgentCommissionBenefits` at `/agent-commission-benefits` with:
- Plain-language commission explanation
- WhatsApp sharing via `navigator.share` API with `wa.me` fallback
- Real money examples (UGX 100,000 base)

### 6. `set_ledger_scope` Trigger Update (Missing)

The trigger now routes `marketing_expense` category to `platform` scope automatically. Not documented in Section 19.6 (root) or anywhere in public file.

### 7. Transaction Categories Incomplete

Neither file lists `marketing_expense` as a Cash Out category, nor `withdrawal_pending` or `withdrawal_reversal`.

### 8. Notify Managers Pattern (Undocumented)

Fire-and-forget manager notification used across bulk role operations, broadcasts, and agent withdrawals. Not documented.

## Changes to Make

### File 1: `WELILE_WORKFLOW.md` (Root — 2349 lines)

| Section | Line Range | Change |
|---------|-----------|--------|
| 4.10 Sub-Agent Network | ~446-452 | Update sub-agent signup bonus from UGX 500 to UGX 10,000 |
| 4.13 Agent Earnings Model | ~468-479 | Rewrite with 10% commission split (2%/8%/recruiter 2%), updated bonuses, marketing_expense ledger |
| 4.18 Backend Edge Functions | ~508-519 | Add `notify-managers`, `wallet-deduction`, `tenant-pay-rent` |
| 17.4 Repayment Accounting | ~1364 | Change "5% commission" to "10% commission via credit_agent_rent_commission" |
| 19.5 Transaction Categories | ~1560-1574 | Add `marketing_expense`, `withdrawal_pending`, `withdrawal_reversal` to Cash Out |
| 19.6 Key Database Triggers | ~1575-1584 | Add `set_ledger_scope` routing for `marketing_expense` → platform |
| 19.7 Key RPCs | ~1585-1591 | Add `credit_agent_event_bonus()` RPC |
| 31.1 Edge Function Registry | ~1924-2038 | Add missing functions: `angel-pool-invest`, `tenant-pay-rent`, `wallet-deduction`, `notify-managers` |
| Appendix F Changelog | ~2322-2346 | Add v3.3 entries for commission model update and marketing_expense categorization |

### File 2: `public/WELILE_WORKFLOW.md` (1934 lines)

| Section | Line Range | Change |
|---------|-----------|--------|
| Section 23 Agent Earnings | ~977-1001 | Rewrite: 10% commission (2% source / 8% manager / recruiter override 2%), updated bonuses, double-entry marketing_expense pattern |
| Section 31 Double-Entry Ledger | ~1143-1163 | Add marketing_expense category explanation |
| Section 32 Edge Functions | ~1166-1287 | Add missing functions: `angel-pool-invest`, `tenant-pay-rent`, `wallet-deduction`, `notify-managers` |
| Section 45 Cash Flow Summary | ~1640-1687 | Update Agent cash flow: 10% commission, correct bonus amounts, marketing_expense as platform outflow |
| Add new section or subsection | After Section 23 or in Section 5 | Document `AgentCommissionBenefits` page with WhatsApp sharing |

## Implementation Approach

1. Update **root** `WELILE_WORKFLOW.md` first — all sections listed above with full detail (not summaries)
2. Update **public** `WELILE_WORKFLOW.md` — mirror the same corrections
3. Bump version to **v3.3** with dated changelog entries
4. Ensure all monetary amounts, percentages, and ledger categories match the latest migration SQL exactly

