

## Remove Payout Day Picker from Funder UI, Keep COO Edit Rights

### What Changes

**1. FundRentDialog.tsx (Supporter "Fund Tenant" dialog)**
- Remove the `payoutDay` state, the `<Select>` picker for "Monthly Payout Date (1st–28th)", and all related validation
- Remove `CalendarDays` import and `Select` components if no longer needed
- Remove `payout_day` from the request body sent to `fund-rent-pool` — the backend will auto-calculate (invested_at + 30 days)
- Update `isValid` to no longer require `payoutDayNum`
- Update success info to show "Every 30 days from investment" instead of a specific day
- Remove `payoutDay` from `successInfo` type

**2. AgentInvestForPartnerDialog.tsx (Agent investing for partner)**
- Remove the `payoutDay` state and the payout day `<select>` picker
- Remove `payout_day` from the request body sent to `agent-invest-for-partner`
- Update the success WhatsApp message to say "Every 30 days" instead of a specific payout day
- Remove `payout_day` from `SuccessData` type

**3. fund-rent-pool edge function**
- Stop expecting `payout_day` from the request body (already calculates 30-day cycle, just remove the parameter requirement)

**4. agent-invest-for-partner edge function**
- Same: stop requiring `payout_day` from body

**5. coo-invest-for-partner edge function**
- Same: stop requiring `payout_day` from body

**6. COO ActivePartnersDetail.tsx — Keep & enhance**
- Keep the "Monthly Payout Day" column in the table and the edit field in the Edit Partner dialog (COO retains ability to override)
- The COO invest dialog: remove payout day input (auto 30-day cycle), same as supporter/agent
- Rename column label from "Payout Day" to "Payout Cycle" for clarity

**7. CreateUserInviteDialog.tsx (Agent creating supporter invite)**
- Remove the "Monthly Payout Day" picker field since payout is now auto-calculated

### Summary
Supporters and agents no longer choose a payout day — the system auto-starts a 30-day countdown from investment date. The COO retains the ability to edit payout settings per partner through the Active Partners management screen.

