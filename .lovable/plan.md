**Goal:** Create a test tenant + rent request for agent **Joshua Wanda** with zero financial-statement impact.

**Approach:**

1. Look up Joshua Wanda's agent profile ID via `supabase--read_query`.
2. Insert test auth user → profile auto-created via `handle_new_user` trigger, name `[TEST] Tenant Joshua Demo`.
3. Assign `tenant` role in `user_roles`.
4. Insert `[TEST] Landlord Joshua Demo` and `[TEST] LC1 Joshua Demo`.
5. Insert `rent_requests` row: `status = 'pending'`, `rent_amount = 100,000`, `agent_id = Joshua's id`, marker in `approval_comment` (table has no metadata col, per prior LOLEM run).
6. Link tenant → agent via `referrals` + `profiles.referrer_id`.
7. **Zero writes** to `general_ledger`, `wallets`, or transaction tables → financial statements untouched.

**Defaults applied** (per your message — only agent was specified):

- Agent: **Joshua Wanda**
- Rent amount: **UGX 100,000**
- Status: **APPROVED**

**Files touched:** None — data inserts only via insert tool.

**Cleanup:** All rows tagged with `[TEST]` prefix and `[TEST] Demo` marker in `approval_comment` for easy identification later.