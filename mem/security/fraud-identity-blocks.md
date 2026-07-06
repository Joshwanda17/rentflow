---
name: Fraud identity blocks
description: Fraud-cutoff accounts permanently block tied phone/email/mobile-money identifiers from signup, login, withdrawals, and earning credits
type: feature
---
Fraud-cutoff accounts must be permanently frozen and identity-blocked. Any phone,
email, mobile-money number, national ID, or user id tied to a fraud account must
not be allowed to sign up, sign in through phone/email lookup, request
withdrawals, receive payout approvals, or receive future earning-style wallet
credits.

Use `fraud_identity_blocks` and the `is_fraud_identifier_blocked` /
`check_fraud_account_by_phone` / `check_fraud_account_by_email` helpers. Every
fraud cutoff must emit `system_events.event_type='account_flagged'` and an
`audit_logs` row with the reason.

Warning SMS language must be formal fraud/legal escalation wording, not fake
police impersonation.