## Goal

In the User Drilldown drawer (`src/components/ops/UserDrilldownDrawer.tsx`), every phone number an operator sees should expose **Call** and **WhatsApp** quick-action buttons, and **every** tenant and landlord field shown in the drawer should be editable in place.

## What changes

### 1. New `ContactActions` row (UI only)

A small reusable component used wherever a phone number is rendered:

```
[Name]                   📞 Call   💬 WhatsApp   ✉️ SMS
+256 7XX XXX XXX
```

- `Call` opens `tel:+256...` via `_self`
- `WhatsApp` opens `https://wa.me/256...?text=<contextual greeting>` (reuses existing `toWhatsAppUrl`) in a new tab
- `SMS` opens `sms:+256...` (already used elsewhere — keep for parity)
- Buttons are `h-7` icon-only on mobile, icon-+-label on ≥sm
- Disabled + grey when no phone is present
- Each surface passes a short context string (e.g. `"Hello, this is Welile Ops — regarding your tenant Jane"`) so the WhatsApp prefill is meaningful

**Replace every existing "phone" display with `<ContactActions />`**, including:

- `ProfileHeader` (tenant + agent) — header line under the name
- `TenantPane` "Landlord on file" card (line 1147)
- Agent → `AgentLandlordsList` rows (line 1490+)
- Agent → `AgentTenantsList` rows (rebuild existing inline tel/wa links into the same component for consistency)
- `LandlordPane` header (line 1838) — landlord's phone + caretaker phone
- `LandlordPane` funders list (line 2016)
- Listings rows where the listing's landlord phone is shown
- Anywhere a `landlord?.phone`, `funder?.phone`, `tenant?.phone`, or `caretaker_phone` is rendered

### 2. Tenant — full editability

`ProfileHeader` already edits name + phone via `ops_update_user_identity`, and `LocationEditor` already saves location via `ops_update_user_location`, and `SmartphoneToggle` already toggles `has_smartphone`. Gaps to close:

- Surface the **Edit** button on the header without the "tap-the-name-first" hover trick — show a pencil button next to the name whenever `canEdit` is true.
- Extend the `ProfileHeader` edit form to also include **avatar URL** (optional input) and pass it to `ops_update_user_identity` (RPC will be extended to accept `p_avatar_url` — defaulting to NULL = unchanged).
- Add a small "Notes" textarea field on the tenant profile (free-text ops note) — backed by a new `profiles.ops_note` column.

### 3. Landlord — full editability (new RPC)

Today the only landlord field that can be edited from the drawer is `has_smartphone`. Add a single `LandlordEditCard` inside `LandlordPane` (under the header card) that edits every meaningful landlord field with one mandatory ≥10-char reason (per Audit Governance):

- `name`, `phone`, `mobile_money_number`, `mobile_money_name`
- `property_address`, `district`, `sub_county`, `village`
- `monthly_rent` (UGX, numeric input)
- `bank_name`, `account_number`
- `description`, `number_of_rooms`
- `caretaker_name`, `caretaker_phone`

Backed by a new SECURITY DEFINER RPC `ops_update_landlord(p_landlord_id, p_patch jsonb, p_reason text)`:
- gated by `is_ops_role(auth.uid())`
- writes only the keys present in `p_patch` (partial update)
- writes one `audit_logs` row (`action_type='landlord_profile_edit'`, `table_name='landlords'`, `record_id=p_landlord_id`, `reason=p_reason`)
- emits a `system_event` (`landlord.profile_edited`) per the event-based architecture rule

Migration also adds `GRANT EXECUTE ON FUNCTION public.ops_update_landlord(...) TO authenticated`.

### 4. Files touched

- `src/components/ops/UserDrilldownDrawer.tsx` — add `ContactActions`, swap every phone display, extend `ProfileHeader` edit form, mount new `LandlordEditCard`.
- `src/components/ops/LandlordEditCard.tsx` (new) — collapsible per-field editor calling `ops_update_landlord` RPC, with the mandatory reason field and inline validation.
- One Supabase migration:
  - `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ops_note text`
  - extend `ops_update_user_identity` to accept optional `p_avatar_url`, `p_ops_note`
  - create `ops_update_landlord(p_landlord_id uuid, p_patch jsonb, p_reason text)`
  - `GRANT EXECUTE` on both

### Out of scope

- No new business logic, no balance/ledger interaction.
- No bulk edits — one record at a time, always with reason ≥10 chars per audit governance.
- No new search surfaces — only drawer-internal additions.

## Constitution check

- Audit Governance: every landlord/tenant edit writes an `audit_logs` row with `action_type`, `table_name`, `record_id`, and a mandatory ≥10-char `reason`. ✓
- Event-based: each edit emits a `system_event` (`landlord.profile_edited` / `tenant.profile_edited`). ✓
- Role isolation: edit gated by `is_ops_role(auth.uid())` server-side, plus existing `canEdit`/`isOps` UI gate. ✓
- No wallet/ledger surface touched — pure profile + UX. ✓
