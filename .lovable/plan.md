
The user reports: when an agent claims a withdrawal but doesn't confirm payment within ~10 minutes, the "AWAITING PAYMENT" state disappears from the payee's view. Need to investigate the claim/expiry logic.

Let me trace the likely cause:
- Claim sets `assigned_cashout_agent_id` + `dispatched_at`
- There's likely a timeout/auto-release mechanism (cron or query filter) that unclaims after 10 minutes so other agents can pick it up
- This auto-release probably also makes the badge disappear from the original agent's "claimed" view

I need to verify by checking the code and DB.
