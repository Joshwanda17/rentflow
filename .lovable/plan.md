
Goal: make the tenant-profile “Pay from Operations Float” buttons work for Lolem.

What I found:
- The disabled state is controlled entirely in `src/components/agent/TenantProfileView.tsx`:
  - one button disables when `floatLoading || agentFloatBalance < 500`
  - another disables when `floatLoading || summary.currentOutstanding <= 0 || agentFloatBalance < 100`
- Both buttons get their balance from `useAgentBalances()`.
- `useAgentBalances()` currently:
  - depends on `useAuth().user.id`
  - silently converts any RPC error into `{ floatBalance: 0, commissionBalance: 0 }`
  - exposes no error state to the UI
- I checked the backend data for Lolem (`e4f07815-7991-422f-946f-7f351b38e954`):
  - wallet balance = UGX 490,000
  - `get_agent_split_balances(...)` returns float = UGX 484,500 and commission = UGX 5,500
- That means the backend is correct. The problem is the frontend still treating her float as unavailable.

Plan:
1. Refactor the balance hook so it can fetch by an explicit agent ID
   - Change `useAgentBalances()` to accept an optional `agentId`
   - Use `agentId ?? user?.id` as the effective ID
   - Return `error` and `effectiveAgentId` in addition to balances/loading
   - Stop masking RPC failures as a fake zero balance; keep safe fallbacks for display, but surface the failure

2. Make the tenant profile use a profile-specific float fetch
   - Update `TenantProfileView` to use the explicit agent ID for the logged-in agent
   - Add a forced refetch when the tenant profile opens/mounts, not just on window focus
   - Ensure both pay buttons read from the same resolved float state

3. Replace the misleading disabled-zero behavior with actionable UI
   - If balance is loading: show loading state only
   - If the balance query errors: show a visible “Couldn’t load Operations Float” message with retry
   - Only show “Insufficient float” when a successful fetch confirms the balance is actually below threshold
   - This prevents “greyed out forever” when the real issue is fetch failure, not lack of money

4. Align the dialog with the same source of truth
   - Update `AgentTenantCollectDialog` to use the same parameterized hook / effective agent ID
   - Keep its validation and quick amounts tied to the resolved float, not an implicit auth-only fetch
   - Refetch balances after a successful allocation and on dialog open

5. Clean up duplicate/confusing button logic
   - Review the two pay buttons in `TenantProfileView`
   - Keep thresholds consistent and make sure they don’t conflict visually
   - If both are needed, ensure they behave identically from the same float/error/loading state

6. Verify end-to-end
   - Test with Lolem’s login on My Tenants → individual tenant profile
   - Confirm the float displays around UGX 484,500
   - Confirm the button enables
   - Complete a small allocation and confirm:
     - tenant outstanding reduces
     - float reduces
     - commission credits correctly
     - UI refreshes immediately

Technical details:
- No database migration looks necessary.
- The backend RPC is already returning the correct numbers.
- The main fix is frontend state handling:
  - parameterized balance fetching
  - explicit error state
  - no silent “0 float” fallback for failed reads

Expected outcome:
- Lolem will see her real Operations Float on tenant profiles.
- The pay buttons will enable when she has sufficient float.
- If balance loading fails, the UI will clearly say so instead of pretending she has zero.
