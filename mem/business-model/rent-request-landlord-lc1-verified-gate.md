---
name: Rent Request Landlord + LC1 Verified Gate
description: Agents cannot post a rent request unless BOTH the landlord and the LC1 chairperson are registered AND verified
type: feature
---
Rule (introduced 2026-06-15):
- An agent may NOT post a rent request unless BOTH:
  - the linked **landlord** exists in `landlords` AND `landlords.verified = true`, and
  - the **LC1 chairperson** (matched by typed LC1 phone) exists in `lc1_chairpersons` AND `lc1_chairpersons.verified = true`.
- Enforced in `src/components/agent/AgentRentRequestDialog.tsx`:
  - `landlordCheck` state now has values `idle|checking|registered|unverified|missing`; the live effect reads `landlords.select('id, verified')` and only returns `registered` when verified, else `unverified`.
  - New `lc1Check` state `idle|checking|verified|unverified|missing`; a live effect keyed on the typed LC1 phone reads `lc1_chairpersons.select('id, verified')`.
  - Both `getStepErrors` (wizard steps 2 landlord / 3 LC1) and `collectValidationErrors` push blocking errors for `unverified`/`missing`/`checking`.
  - `handleSubmit` re-verifies against fresh DB reads: landlord must be `verified`; LC1 must already exist AND be `verified` (no more silent unverified LC1 creation).
  - Inline status hints shown under the landlord card and LC1 phone field.
- House-selected landlords are no longer exempt from verification — the fresh submit-time landlord read enforces `verified` regardless of how the landlord was resolved.
- Outstanding flow: LC1 is already linked to the landlord, so only the landlord verified gate applies there.
