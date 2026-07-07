---
name: Agent House Listing Eligibility
description: Agents must have field activity (referral + posted tenant + rent repayment) before they can list houses
type: feature
---
An agent may only create their own `house_listings` row after meeting ALL three field-activity conditions:
1. **Referred ≥1 user** — `referrals.referrer_id = agent`
2. **Posted ≥1 tenant rent request** — `rent_requests.agent_id = agent`
3. **Recorded ≥1 rent repayment** — `agent_collections.agent_id = agent`

Enforcement (defense-in-depth):
- **Server**: `get_agent_listing_eligibility(p_user_id default auth.uid())` RPC returns the checklist + `eligible` flag. BEFORE INSERT trigger `trg_enforce_agent_listing_eligibility` on `house_listings` raises `AGENT_LISTING_INELIGIBLE` (errcode P0001) when a user inserts their OWN listing (`agent_id = auth.uid()`) while ineligible.
- **Bypass**: leadership/ops roles (`manager, super_admin, coo, cfo, ceo, operations`) and system/on-behalf inserts (`agent_id <> auth.uid()`, or service_role where `auth.uid()` is null) are NOT gated.
- **Client**: `ListEmptyHouseDialog` calls the RPC on open, shows a 3-item unlock checklist when ineligible instead of the form, and handles the `AGENT_LISTING_INELIGIBLE` error on submit.

Rule applies to NEW listings only; pre-existing listings from now-ineligible agents are untouched.
