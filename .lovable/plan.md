

## Plan: Add "Register New Investor" to Select Investor Dialog

**Problem**: When an agent searches for an investor in the Angel Pool investment dialog and doesn't find them, there's no way to register a new one inline. The agent has to leave the flow, go to "My Funders", register there, and come back.

**Solution**: Add a "Register New Investor" inline form to the `AgentAngelPoolInvestDialog` search step, reusing the existing `register-proxy-funder` edge function.

---

### Changes to `src/components/agent/AgentAngelPoolInvestDialog.tsx`

1. **Add a `register` sub-step** within the search step:
   - New state: `showRegister` boolean, `regName`, `regPhone`, `regNotes`, `registering`
   - Import `usePhoneDuplicateCheck` for duplicate phone validation

2. **Show "Register New Investor" button** when search returns no results (after the "No results found" message), or as a persistent link below search results

3. **Inline registration form** (toggled by `showRegister`):
   - Full Name (required)
   - Phone Number (required, with duplicate check)
   - Notes (optional)
   - Info banner about USSD/SMS access
   - Calls `register-proxy-funder` edge function with agent's user ID
   - On success: auto-selects the newly created investor and moves to the amount step

4. **Reset** registration state in the existing `reset()` function

### UI Flow
```text
[Search box] [🔍]

  No results found
  ──────────────
  👤 Register New Investor
  ┌─────────────────────────┐
  │ Full Name *             │
  │ Phone Number *          │
  │ Notes (optional)        │
  │ [Register & Select]     │
  └─────────────────────────┘
```

### No database changes needed
The `register-proxy-funder` edge function already exists and handles profile creation + proxy assignment.

