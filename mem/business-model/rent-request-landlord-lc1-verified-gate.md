---
name: Rent Request Landlord + LC1 Verified Gate
description: Agents cannot post a rent request unless BOTH the landlord and the LC1 chairperson are registered AND verified
type: feature
---
UPDATE (2026-06-16d, REVERSES 2026-06-16 auto-verify): **LC1 chairpersons require MANUAL Landlord-Ops verification again.** The auto-verify trigger `trg_auto_verify_lc1_chairperson` and function `public.auto_verify_lc1_chairperson()` were DROPPED. New `lc1_chairpersons` rows insert with `verified=false` (column default) and must be manually verified by ops. The 603 rows auto-verified during the brief auto-verify window were left verified (not reset). The LC1 verified gate below is therefore enforced again, and the "Needs Verification" filter in the LandlordOpsDashboard LC1 view populates with unverified rows.

UPDATE (2026-06-16b): **Agent self-service "ping ops to verify" for BOTH landlord and LC1.** When the rent-request gate finds an unverified landlord OR an unverified LC1 chairperson, the agent sees a "Request verification from Landlord Ops" button in `AgentRentRequestDialog`.
- Landlord path (pre-existing): inserts into `landlord_verification_requests`; surfaced in `AgentVerificationRequestsPanel` on the Landlord Ops dashboard.
- LC1 path (new): inserts into `lc1_verification_requests` (table mirrors landlord one: `lc1_id`, `lc1_name/phone/village`, `requested_by`, `agent_name/phone`, `status`, `reject_comment`, `resolved_by/at`; UNIQUE pending index per `lc1_id`; RLS: agent creates/views own, `is_ops_role` views+updates all; realtime-enabled). Surfaced in `Lc1VerificationRequestsPanel` on the Landlord Ops dashboard, where ops Verify (flips `lc1_chairpersons.verified`) or Reject (10-char comment). State machine on both buttons: `idle|sending|sent|exists`. Both write `audit_logs`.

UPDATE (2026-06-16c): **Landlord Operations can verify LC1 chairpersons directly (not just managers).** `lc1_chairpersons` UPDATE + SELECT RLS now use `is_ops_role(auth.uid())` (manager/super_admin/coo/operations) instead of manager-only. `VerifyLc1Button` (LC1 view → "Needs Verification" filter chip in `LandlordOpsDashboard`) now enables the Hold-to-Verify control for any ops role via `useAuth().roles`, not just `role === 'manager'`. The "Needs Verification" chip lists all unverified LC1 rows so ops can clear the backlog.

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
