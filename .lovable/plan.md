
**Goal:** Create a test tenant + rent request linked to a specified agent, with zero financial-statement impact.

**Why it's safe:** Per the ledger classification system, financial statements only read `general_ledger` rows. A tenant + rent request alone writes nothing to `general_ledger` — ledger entries only fire on disbursement/repayment. As long as we skip disbursement, statements are untouched.

**Approach:**
1. Insert a test auth user + profile, name prefixed `[TEST]` so it's visually obvious.
2. Assign `tenant` role.
3. Insert a `[TEST]` landlord and `[TEST]` LC1 chairperson.
4. Insert a `rent_requests` row: `status = 'pending'`, with `metadata = {"is_test": true}` for easy cleanup later.
5. Link the test tenant to the agent via the `referrals` table.
6. **Zero writes** to `general_ledger`, `wallets`, or any transaction table.

**Files touched:** Insert tool only (data inserts), no schema migration, no code changes.

**Need from you (quick confirm):**
- **Which agent?** Options: LOLEM FIRICILA, Joshua Wanda, or another (give name/phone).
- **Rent amount?** Default UGX 100,000 — say if you'd prefer otherwise.
- **Status?** Default `pending` (sits in agent's pipeline). Say if you want `approved` instead.

Reply with your choices and I'll run the inserts.
