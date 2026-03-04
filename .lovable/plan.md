

## Adding Test Funds to Your Agent Wallet

### Important Context
This is a **production system** with real users and real money flows. Directly editing wallet balances would bypass the double-entry ledger and break audit integrity. Test funds must go through the proper approval workflow.

### Recommended Approach — Use the Existing Deposit Flow

1. **Submit a deposit request** from your agent dashboard (the deposit button should already exist)
2. **Switch to the Manager dashboard** and approve the deposit via the Deposits Management page
3. Your agent wallet will be credited through the proper ledger flow

This ensures the test funds are fully tracked and can be cleanly reversed later.

### Alternative — Create a "Seed Test Funds" Edge Function

If you'd prefer a one-click solution for testing, I can build a **test-only edge function** that:

- Accepts a user ID and amount
- Creates a proper `pending_wallet_operations` entry with category `test_funds_cleanup`
- Auto-approves it through the ledger (service-role only)
- Tags it clearly as test data for easy cleanup later

This keeps the audit trail intact while making testing faster.

### What I Need From You
Which approach do you prefer?
1. **Use the existing deposit flow** — no code changes needed, just submit a deposit request and approve it as manager
2. **Build a test-seed function** — I'll create an edge function for quick test fund injection with proper ledger entries

