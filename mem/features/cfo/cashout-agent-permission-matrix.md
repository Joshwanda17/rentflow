---
name: Cash-Out Agent permission matrix
description: CFO-configurable permission matrix (payout categories, approvals, float, limits, networks, banks, security, status) per merchant/cash-out agent, stored in cashout_agents.config jsonb
type: feature
---
The CFO "Edit Cash-Out Agent" modal (`CashoutAgentManager.tsx` → `EditMerchantDialog`) is a full permission matrix, not just a channel selector. All settings persist to `cashout_agents.config` (jsonb, default `{}`).

**Sections (accordion):** General (label + region/district/branch/cluster/supervisor/team + Agent Status: active/suspended/blocked/under_review/on_leave), Payment Channels (Mobile Money → MTN/Airtel sub-toggles, Bank Transfer → per-bank sub-toggles, Cash Payout), Authorized Payout Categories (grouped, each enabled category gets an approval-rule Select), Float Permissions (request/receive/distribute/emergency + max), Transaction Limits (daily/single/monthly/max+min cash-out), Security (OTP/2FA/device restriction/high-value verification).

**Config shape + constants:** `src/lib/cashoutAgentConfig.ts` — `CashoutAgentConfig`, `defaultCashoutAgentConfig()`, `normalizeCashoutAgentConfig(raw, legacyRow)`, `PAYOUT_CATEGORY_GROUPS`, `ALL_PAYOUT_CATEGORIES`, `APPROVAL_RULES`, `AGENT_STATUSES`, `SUPPORTED_BANKS`.

**Legacy sync (important):** on save, the legacy boolean columns are kept in sync so existing routing/filters keep working — `handles_cash=channels.cash`, `handles_bank=channels.bank`, `handles_mtn=channels.momo && networks.mtn`, `handles_airtel=channels.momo && networks.airtel`, `is_active = status==='active'`. `normalizeCashoutAgentConfig` seeds channels/networks from these columns when no config was ever saved.

**Validation:** must have ≥1 channel AND ≥1 authorized category. Change audited to `audit_logs` (`cfo_merchant_agent_updated`, before/after + config).

NOTE: This stores the CFO's intent/config. Enforcement across the payout edge functions (blocking an agent from settling a category they're not authorized for, applying per-category approval routing) is NOT yet wired — it is a future step that should read `cashout_agents.config`.
