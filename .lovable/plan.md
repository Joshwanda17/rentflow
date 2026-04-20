
User wants a test tenant seeded so we can run the Agent → Pay Rent → Landlord flow end-to-end. I need to identify the current agent, then create the tenant + landlord + an active rent_request linking them.

Let me check what I know:
- Tenant phone: 0701600164
- Landlord phone: 0704825473
- "Current agent" = whoever is logged in to the preview right now. I need to confirm who that is before seeding, otherwise the rent_request will be assigned to the wrong agent and won't appear in their wizard.

I'll need to (in default mode):
1. Read auth state / ask user to confirm agent identity (or query `profiles` for the active session — but I can't read `auth.uid()` from the user's browser; I'd query by name once user confirms).
2. Check if tenant 0701600164 already exists (last-9 phone match on `profiles`).
3. Check if landlord 0704825473 already exists in `landlords`.
4. Create what's missing:
   - Tenant: auth user via `supabaseAdmin.auth.admin.createUser` with virtual email `701600164@noapp.welile.user`, profile row, `tenant` role, National ID (test value), referral row linking to agent.
   - Landlord: row in `landlords` with phone `0704825473`, `mobile_money_number = 0704825473`, `registered_by = agent_id`.
   - LC1: minimal row in `lc1_chairpersons` (required by `rent_requests`).
5. Seed an **active rent_request**: status `active` (or whatever status the AgentFloatPayoutWizard list query filters on — need to check), with a sensible rent_amount (e.g. 150,000 UGX), tenant_id, agent_id, landlord_id, lc1_id, all financial fields set so the wizard picks it up.
6. Allocate landlord float to that rent_request so the wizard can deduct from it. Need to check `agent_landlord_float_allocations` shape — Phase 1 backfilled legacy ones so the trigger should exist. Likely need to top up the agent's `agent_landlord_float.balance` first (e.g. 200,000 UGX) so there's float to deduct.

### Open questions before I can execute

I need to ask 2 things:

1. **Which agent?** I need the agent's name or phone to look them up. (Alternatively I can list agents who are currently logged in / active in last hour, but cleaner to ask.)
2. **Rent amount + float top-up amount?** Default suggestion: rent = 150,000 UGX, float top-up = 200,000 UGX. Confirm or override.

I'll ask these two and also confirm the test tenant's name + National ID since both are required by schema.

### Steps once answered (default mode)

1. SQL lookup: agent profile by name → `agent_id`.
2. SQL lookup: tenant by `phone ilike '%701600164'`; landlord by `phone ilike '%704825473'`.
3. Insert missing rows (auth user via admin API needs a tiny edge function OR a one-shot script — actually we can call existing `register-tenant` edge function with the agent's auth context to create the tenant cleanly, then patch landlord + rent_request via insert tool).
4. Insert `landlords` row, `lc1_chairpersons` row.
5. Insert `rent_requests` row with status that the wizard's "ready to pay" query expects (need to grep `AgentFloatPayoutWizard` for the filter — likely `status in ('active','approved')` and `landlord_paid = false`).
6. Top up `agent_landlord_float` for that agent so balance ≥ rent.
7. Optionally seed `agent_landlord_float_allocations` row pointing rent_request → float (the Phase 1 trigger may auto-create on rent activation; if not, insert manually).
8. Report back: tenant ID, landlord ID, rent_request ID, current float balance — user can then open the wizard and see the row.

Ready to ask the 2 confirmation questions, then execute.
