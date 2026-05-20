---
name: Managed-Proxy Payout Routing
description: Wallet credits for partners with an active+approved is_managed_account=true proxy assignment route to the proxy's wallet; partner gets a notice naming the agent; the proxy receives a "proxy-managed-payout-notice" email.
type: feature
---
When a partner has a `proxy_agent_assignments` row with `is_active=true`, `approval_status='approved'`, AND `is_managed_account=true`:
- The wallet-leg of any partner payout (currently enforced in `process-supporter-roi`) MUST credit `user_id = proxy.agent_id`, NEVER the partner. The platform-leg still references the partner for accounting.
- Helper: `resolveManagedProxy(supabase, partnerId)` in `supabase/functions/_shared/partnership-emails.ts` is the single source of truth for this check.
- Partner email: `returns-disbursement-confirmation` is sent with `isManagedByAgent=true` + `agentName` so the body explicitly names the proxy agent who received the funds. The `payoutMethod` label becomes `Proxy Agent Wallet (<name>)`.
- Proxy email: a new template `proxy-managed-payout-notice` is sent to the agent via `buildProxyManagedPayoutRequest`. Idempotency key: `proxy-managed-payout-<agentId>-<partnerId>-<txGroupId>`.
- In-app notifications: partner gets "Monthly Reward Sent to Your Proxy Agent" with metadata `routed_to_proxy_agent_id` + `proxy_assignment_id`; proxy gets "Proxy Payout Received" with metadata `on_behalf_of_partner_id`.
- Auto-reinvest branch is unaffected — those funds stay in the portfolio principal, never touching a wallet.
